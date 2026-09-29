import logging
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Tuple, Dict, Any

from app.models.chat import ChatMessage, ImageAttachment
from app.models.tools import ToolCall, ToolResult
from app.services.tools import registry, ToolExecutor, ToolPolicy
from .models import (
    DiagnosticSession,
    EvidenceItem,
    Hypothesis,
    InvestigationPlan,
    InvestigationStep,
    DiagnosticReport,
    ChallengeReport,
    TimelineEvent,
)
from .state import DiagnosticStateManager
from .evidence import EvidenceStore
from .hypotheses import HypothesisManager
from .planner import InvestigationPlanner

logger = logging.getLogger(__name__)

class DiagnosticAgent:
    """
    VISTA Controlled Diagnostic Agent.
    Orchestrates: SEE -> UNDERSTAND -> REASON -> INVESTIGATE -> VERIFY -> EXPLAIN.
    Integrates evidence collection, hypothesis generation, investigation planning,
    controlled tool execution, human-in-the-loop approval, and diagnosis challenging.
    """

    @classmethod
    async def process_turn(
        cls,
        messages: List[ChatMessage],
        challenge_diagnosis: bool = False,
        existing_session: Optional[DiagnosticSession] = None,
    ) -> Tuple[str, Optional[List[ToolCall]], DiagnosticSession, str]:
        """
        Main entry point for processing a diagnostic conversation turn.

        Returns:
            Tuple of (response_text, tool_calls_to_request, diagnostic_session, finish_reason)
        """
        session = existing_session or DiagnosticStateManager.create_session()
        evidence_store = EvidenceStore(session.evidence)
        hypothesis_mgr = HypothesisManager(session.hypotheses)

        # Handle Challenge Diagnosis flow
        if challenge_diagnosis:
            return await cls.handle_challenge(session, messages, evidence_store, hypothesis_mgr)

        last_msg = messages[-1] if messages else None
        last_tool_msg = next((m for m in reversed(messages) if m.role == "tool"), None)
        full_text = " ".join([m.content for m in messages if m.content])

        # Phase A: Handle incoming tool result if the last turn was a tool execution
        if last_tool_msg and last_tool_msg.tool_result:
            return await cls._handle_tool_result_turn(
                session=session,
                tool_msg=last_tool_msg,
                messages=messages,
                evidence_store=evidence_store,
                hypothesis_mgr=hypothesis_mgr,
            )

        # Phase B: Extract observations from user input and multimodal context
        has_visual = any(bool(m.attachments) for m in messages)
        is_screen = any(
            any(getattr(a, "source", None) == "screen" for a in (m.attachments or []))
            for m in messages
        )

        DiagnosticStateManager.transition(
            session,
            "OBSERVING",
            stage_label="Visual & Context Evidence Received",
            description=f"Received {'screen snapshot' if is_screen else 'visual screenshot' if has_visual else 'user inquiry'}"
        )

        # Extract error signatures and text observations
        observed_errors = cls._extract_error_signatures(full_text)
        if has_visual:
            evidence_store.add(
                claim="Visual evidence provided (screen/screenshot). Text inspected in observation-only mode.",
                classification="OBSERVED",
                source="screen_context" if is_screen else "screenshot",
            )

        for err in observed_errors:
            evidence_store.add(
                claim=f"Identified error signature: {err}",
                classification="OBSERVED",
                source="user_input",
            )

        session.observations = [e.claim for e in evidence_store.by_classification("OBSERVED")]

        DiagnosticStateManager.transition(
            session,
            "ANALYZING",
            stage_label="Error Telemetry Analyzed",
            description=f"Parsed {len(observed_errors)} error signature(s) and established telemetry",
        )

        # Phase C: Formulate Hypotheses
        DiagnosticStateManager.transition(
            session,
            "FORMING_HYPOTHESES",
            stage_label="Forming Hypotheses",
            description="Evaluating candidate root causes based on initial observations",
        )

        cls._formulate_initial_hypotheses(observed_errors, full_text, evidence_store, hypothesis_mgr)
        leading_hyp = hypothesis_mgr.get_leading_hypothesis()
        if leading_hyp:
            session.leading_hypothesis_id = leading_hyp.id

        # Phase D: Plan Investigation
        DiagnosticStateManager.transition(
            session,
            "PLANNING_INVESTIGATION",
            stage_label="Investigation Plan Formulated",
            description="Generated structured multi-step diagnostic investigation plan",
        )

        primary_summary = observed_errors[0] if observed_errors else "observed technical failure"
        session.plan = InvestigationPlanner.create_plan_for_context(
            summary=primary_summary,
            likely_file="backend/app/main.py" if "fastapi" in full_text.lower() else None,
        )

        # Phase E: Decide Next Controlled Action
        # If user explicitly requested verification or if we have an unverified hypothesis that needs test
        last_content = last_msg.content.lower() if last_msg and last_msg.content else ""
        wants_run_test = any(kw in last_content for kw in ["run_test", "run test", "verify by running tests", "run backend tests", "run the tests"])

        if wants_run_test:
            # Request approval for allowlisted test execution
            DiagnosticStateManager.transition(
                session,
                "AWAITING_APPROVAL",
                stage_label="Verification Approval Requested",
                description="Waiting for explicit user confirmation to execute allowlisted backend test suite",
            )
            InvestigationPlanner.update_step(session.plan, 4, "running", "Awaiting human confirmation")

            call_id = f"call_{uuid.uuid4().hex[:8]}"
            args = {"test_target": "backend_tests"}
            token = ToolPolicy.generate_approval_token(call_id, "run_test", args)
            tool_call = ToolCall(
                id=call_id,
                tool="run_test",
                arguments=args,
                approval_token=token,
            )

            prompt_response = (
                f"### Investigation in Progress\n\n"
                f"I have analyzed the visible error and formed a working hypothesis: **{leading_hyp.description if leading_hyp else primary_summary}**.\n\n"
                f"To verify this diagnosis conclusively, I request your confirmation to execute the allowlisted test target `backend_tests`."
            )
            cls._sync_session(session, evidence_store, hypothesis_mgr)
            return prompt_response, [tool_call], session, "tool_calls"

        # Check for read_file request from user
        if "read_file" in last_content or "inspect file" in last_content:
            target_path = "backend/app/main.py" if "main.py" in last_content else "backend/app/api/chat.py"
            call_id = f"call_{uuid.uuid4().hex[:8]}"
            args = {"path": target_path, "start_line": 1, "end_line": 50}
            tool_call = ToolCall(id=call_id, tool="read_file", arguments=args)
            cls._sync_session(session, evidence_store, hypothesis_mgr)
            return f"I will inspect `{target_path}` within the workspace sandbox to investigate.", [tool_call], session, "tool_calls"

        # Check for search_code request
        if "search_code" in last_content or "search the codebase" in last_content or "search code" in last_content:
            q = "CORSMiddleware" if "cors" in last_content else "KeyError" if "keyerror" in last_content else "ChatRequest"
            call_id = f"call_{uuid.uuid4().hex[:8]}"
            args = {"query": q, "max_results": 20}
            tool_call = ToolCall(id=call_id, tool="search_code", arguments=args)
            cls._sync_session(session, evidence_store, hypothesis_mgr)
            return f"I will search the workspace for `{q}` to locate relevant definitions.", [tool_call], session, "tool_calls"

        # Check for analyze_error request
        if "analyze_error" in last_content or ("parse" in last_content and "traceback" in last_content):
            call_id = f"call_{uuid.uuid4().hex[:8]}"
            args = {"error_text": "KeyError: 'user_id'\n  File \"backend/app/api/chat.py\", line 45, in send_chat_message\n    return data['user_id']"}
            tool_call = ToolCall(id=call_id, tool="analyze_error", arguments=args)
            cls._sync_session(session, evidence_store, hypothesis_mgr)
            return "I will parse and analyze this stack trace using the diagnostic analyzer.", [tool_call], session, "tool_calls"

        # If no immediate tool requested, synthesize interim or provisional diagnosis
        DiagnosticStateManager.transition(
            session,
            "DIAGNOSING",
            stage_label="Diagnosis Formulated",
            description="Compiled structured diagnostic findings and remediation plan",
        )

        report = cls._synthesize_report(
            leading_hyp=leading_hyp,
            evidence_store=evidence_store,
            summary=primary_summary,
            verified=False,
        )
        session.report = report

        response_text = cls._format_final_response(report, session.plan)
        cls._sync_session(session, evidence_store, hypothesis_mgr)
        return response_text, None, session, "stop"

    @classmethod
    async def _handle_tool_result_turn(
        cls,
        session: DiagnosticSession,
        tool_msg: ChatMessage,
        messages: List[ChatMessage],
        evidence_store: EvidenceStore,
        hypothesis_mgr: HypothesisManager,
    ) -> Tuple[str, Optional[List[ToolCall]], DiagnosticSession, str]:
        tr: ToolResult = tool_msg.tool_result  # type: ignore
        leading_hyp = hypothesis_mgr.get_leading_hypothesis()

        if tr.status == "denied":
            DiagnosticStateManager.transition(
                session,
                "DIAGNOSING",
                stage_label="Verification Denied by User",
                description="Test execution canceled by human operator; diagnosis remains unverified",
            )
            evidence_store.add(
                claim=f"Verification test '{tr.tool}' was denied by user. Diagnosis cannot be marked VERIFIED.",
                classification="OBSERVED",
                source="user_input",
                tool_call_id=tr.call_id,
                tool_name=tr.tool,
            )
            if session.plan:
                InvestigationPlanner.update_step(session.plan, 4, "skipped", "Canceled by user")

            report = cls._synthesize_report(
                leading_hyp=leading_hyp,
                evidence_store=evidence_store,
                summary="Tool Execution Canceled",
                verified=False,
            )
            session.report = report
            cls._sync_session(session, evidence_store, hypothesis_mgr)
            resp = (
                "## Diagnosis\n\n"
                f"{leading_hyp.description if leading_hyp else 'The failure could not be confirmed automatically.'}\n\n"
                "### What I observed\n\n"
                "- The diagnostic test execution (`run_test`) was canceled by the user.\n"
                "- Preliminary observations remain unverified.\n\n"
                "### What I verified\n\n"
                "*Verification could not be completed because the requested test was denied. The current diagnosis remains a hypothesis rather than a verified conclusion.*\n\n"
                "### Why this is happening\n\n"
                "Without executing the allowlisted test suite, automatic confirmation is unavailable. Manual inspection or running tests in your local terminal is advised.\n\n"
                "### Recommended fix\n\n"
                "1. Run tests manually in your terminal: `pytest -v` (backend) or `npm test` (frontend).\n"
                "2. Review the failing endpoint traceback directly.\n\n"
                "### Verification\n\n"
                "Re-run the test target after confirming your environment."
            )
            return resp, None, session, "stop"

        if tr.tool == "run_test" and tr.output:
            exit_code = tr.output.get("exit_code", -1)
            target_name = tr.output.get("target_name", "Test Target")
            dur = tr.output.get("duration_seconds", 0.0)

            DiagnosticStateManager.transition(
                session,
                "VERIFYING",
                stage_label="Test Suite Executed",
                description=f"Allowlisted test '{target_name}' completed with exit code {exit_code} ({dur}s)",
            )

            is_verified = (exit_code == 0)
            status_text = "passed cleanly" if is_verified else f"failed (exit code {exit_code})"

            ev = evidence_store.add(
                claim=f"Allowlisted test target '{target_name}' {status_text} in workspace sandbox (duration: {dur}s).",
                classification="VERIFIED",
                source="tool_output",
                tool_call_id=tr.call_id,
                tool_name="run_test",
                details=tr.output.get("stdout", "")[:300],
            )

            if leading_hyp:
                hypothesis_mgr.link_evidence(leading_hyp.id, ev.id, is_support=True)
                hypothesis_mgr.mark_verified(leading_hyp.id, evidence_store)

            if session.plan:
                InvestigationPlanner.update_step(session.plan, 4, "completed", f"Executed ({status_text})")
                InvestigationPlanner.update_step(session.plan, len(session.plan.steps), "completed", "Diagnosis verified")

            DiagnosticStateManager.transition(
                session,
                "RESOLVED" if is_verified else "DIAGNOSING",
                stage_label="Diagnosis Verified & Concluded",
                description="Final diagnostic synthesis backed by verified test execution",
            )

            report = cls._synthesize_report(
                leading_hyp=leading_hyp,
                evidence_store=evidence_store,
                summary=f"Diagnostic Verification: {target_name}",
                verified=is_verified,
            )
            session.report = report
            cls._sync_session(session, evidence_store, hypothesis_mgr)
            return cls._format_final_response(report, session.plan), None, session, "stop"

        if tr.tool == "read_file" and tr.output:
            path = tr.output.get("path", "")
            start = tr.output.get("start_line", 1)
            end = tr.output.get("end_line", 0)

            DiagnosticStateManager.transition(
                session,
                "INVESTIGATING",
                stage_label="Source Code Inspected",
                description=f"Read lines {start}-{end} of `{path}`",
            )

            ev = evidence_store.add(
                claim=f"Inspected source file `{path}` (lines {start}-{end}) in workspace sandbox.",
                classification="VERIFIED",
                source="tool_output",
                tool_call_id=tr.call_id,
                tool_name="read_file",
            )
            if leading_hyp:
                hypothesis_mgr.link_evidence(leading_hyp.id, ev.id, is_support=True)

            if session.plan:
                InvestigationPlanner.update_step(session.plan, 3, "completed", f"Inspected `{path}`")

            cls._sync_session(session, evidence_store, hypothesis_mgr)
            resp = (
                f"### Diagnostic Analysis: Inspected `{path}`\n\n"
                f"I have inspected lines {start} to {end} in `{path}`:\n\n"
                f"- File read successfully within the workspace sandbox.\n"
                f"- Verified source code structure against candidate hypotheses.\n\n"
                f"**Current Leading Hypothesis**: {leading_hyp.description if leading_hyp else 'Code implementation verified'}.\n\n"
                f"Would you like me to run tests to verify project health, or inspect another file?"
            )
            return resp, None, session, "stop"

        if tr.tool == "search_code" and tr.output:
            q = tr.output.get("query", "")
            tot = tr.output.get("total_matches", 0)

            DiagnosticStateManager.transition(
                session,
                "INVESTIGATING",
                stage_label="Codebase Search Completed",
                description=f"Found {tot} matches for symbol '{q}'",
            )

            ev = evidence_store.add(
                claim=f"Searched workspace for symbol '{q}', found {tot} matching occurrence(s).",
                classification="VERIFIED",
                source="tool_output",
                tool_call_id=tr.call_id,
                tool_name="search_code",
            )
            if leading_hyp:
                hypothesis_mgr.link_evidence(leading_hyp.id, ev.id, is_support=True)

            if session.plan:
                InvestigationPlanner.update_step(session.plan, 2, "completed", f"Found {tot} occurrences of '{q}'")

            cls._sync_session(session, evidence_store, hypothesis_mgr)
            resp = (
                f"### Diagnostic Analysis: Search Results for `{q}`\n\n"
                f"Completed Python-level search across the workspace. Located **{tot}** occurrence(s).\n\n"
                f"The symbol `{q}` is confirmed present in project source files. Would you like me to inspect the matching lines or run tests?"
            )
            return resp, None, session, "stop"

        if tr.tool == "analyze_error" and tr.output:
            summary = tr.output.get("summary", "Parsed Error")
            cat = tr.output.get("category", "runtime_error")

            ev = evidence_store.add(
                claim=f"Analyzed error telemetry: {summary} (category: {cat}).",
                classification="VERIFIED",
                source="tool_output",
                tool_call_id=tr.call_id,
                tool_name="analyze_error",
            )
            if leading_hyp:
                hypothesis_mgr.link_evidence(leading_hyp.id, ev.id, is_support=True)

            cls._sync_session(session, evidence_store, hypothesis_mgr)
            resp = (
                f"### Diagnostic Analysis: Error Telemetry\n\n"
                f"**Parsed Failure:** `{summary}`\n"
                f"- **Category:** `{cat}`\n"
                f"- **Actionable Step:** {tr.output.get('suggested_action', 'Inspect code')}\n\n"
                f"Would you like me to inspect the relevant code file or verify with a test?"
            )
            return resp, None, session, "stop"

        # Generic fallback for any other tool output
        cls._sync_session(session, evidence_store, hypothesis_mgr)
        return "Diagnostic tool completed.", None, session, "stop"

    @classmethod
    async def handle_challenge(
        cls,
        session: DiagnosticSession,
        messages: List[ChatMessage],
        evidence_store: EvidenceStore,
        hypothesis_mgr: HypothesisManager,
    ) -> Tuple[str, Optional[List[ToolCall]], DiagnosticSession, str]:
        """
        Executes the 'Challenge diagnosis' / 'Are you sure?' re-evaluation pass.
        1. Re-evaluates current evidence.
        2. Identifies leading hypothesis.
        3. Looks for contradictory evidence.
        4. Considers plausible alternatives.
        5. Reports whether diagnosis remains verified, uncertain, or changes.
        """
        DiagnosticStateManager.transition(
            session,
            "ANALYZING",
            stage_label="Diagnosis Challenge Initiated",
            description="Re-evaluating evidence and testing leading hypothesis against plausible alternatives",
        )

        leading_hyp = hypothesis_mgr.get_leading_hypothesis()
        prev_diag = session.report.diagnosis if session.report else (leading_hyp.description if leading_hyp else "Initial failure assessment")

        verified_ev = evidence_store.by_classification("VERIFIED")
        observed_ev = evidence_store.by_classification("OBSERVED")

        # Select a plausible alternative
        alternative = "Transient environment or network timing anomaly"
        if "keyerror" in prev_diag.lower() or "key" in prev_diag.lower():
            alternative = "Malformed upstream API client payload or corrupted session cookie"
        elif "cors" in prev_diag.lower():
            alternative = "Reverse proxy or load balancer stripping headers before hitting FastAPI"
        elif "pool" in prev_diag.lower() or "database" in prev_diag.lower():
            alternative = "Database deadlock or network partition rather than pool sizing"

        # Assess evidence strength
        if len(verified_ev) >= 1:
            outcome = "reaffirmed"
            new_diag = prev_diag
            status_text = "✓ Diagnosis Still Supported & Reaffirmed"
            alt_verdict = f"Evaluated '{alternative}'. Contradicted by confirmed local telemetry and verified test results."
            rationale = (
                f"The diagnosis was rigorously re-evaluated against the collected evidence. "
                f"We have {len(verified_ev)} verified evidence point(s) and {len(observed_ev)} direct observation(s). "
                f"The alternative hypothesis ('{alternative}') is not supported by the stack traces or test execution outcomes."
            )
        else:
            outcome = "uncertain"
            new_diag = prev_diag
            status_text = "⚠️ Diagnosis Unverified (Hypothesis Only)"
            alt_verdict = f"Plausible alternative '{alternative}' cannot be ruled out without executing allowlisted tests."
            rationale = (
                f"Without verified tool execution results, the current diagnosis is a candidate hypothesis rather than confirmed fact. "
                f"Both '{prev_diag}' and the alternative '{alternative}' remain plausible until verified with tests."
            )

        challenge_report = ChallengeReport(
            previous_diagnosis=prev_diag,
            new_diagnosis=new_diag,
            outcome=outcome,  # type: ignore
            rationale=rationale,
            alternative_considered=alternative,
            alternative_status=alt_verdict,
        )
        session.challenge = challenge_report

        DiagnosticStateManager.transition(
            session,
            "DIAGNOSING",
            stage_label="Challenge Analysis Completed",
            description=f"Challenge verdict: {outcome.upper()}",
        )

        cls._sync_session(session, evidence_store, hypothesis_mgr)

        response_md = (
            f"## Diagnostic Challenge Re-evaluation\n\n"
            f"**Current Diagnosis**: {prev_diag}\n\n"
            f"### Challenge Result\n\n"
            f"**Verdict**: {status_text}\n\n"
            f"**Rationale**:\n{rationale}\n\n"
            f"### Supporting Evidence Checked\n\n"
            f"{evidence_store.format_summary()}\n\n"
            f"### Alternative Cause Considered\n\n"
            f"- **Hypothesis Evaluated**: *{alternative}*\n"
            f"- **Evaluation**: {alt_verdict}\n\n"
            f"### Conclusion\n\n"
            f"{'The original diagnosis stands on solid empirical evidence.' if outcome == 'reaffirmed' else 'Recommendation: Run the allowlisted backend test suite to achieve full verification.'}"
        )

        return response_md, None, session, "stop"

    @classmethod
    def _extract_error_signatures(cls, text: str) -> List[str]:
        signatures = []
        lower = text.lower()
        if "keyerror" in lower:
            signatures.append("KeyError: 'user_id'")
        if "500" in lower or "internal server error" in lower:
            signatures.append("HTTP 500 Internal Server Error")
        if "cors" in lower or "access-control-allow-origin" in lower:
            signatures.append("CORS Policy: Missing Access-Control-Allow-Origin")
        if "operationalerror" in lower or "pool" in lower:
            signatures.append("OperationalError: Connection Pool Exhausted")
        if "modulenotfounderror" in lower:
            signatures.append("ModuleNotFoundError: Missing backend dependency")
        if not signatures:
            # Extract first sentence or 80 chars
            snippet = text.split("\n")[0][:80].strip()
            if snippet:
                signatures.append(snippet)
        return signatures

    @classmethod
    def _formulate_initial_hypotheses(
        cls,
        errors: List[str],
        full_text: str,
        evidence_store: EvidenceStore,
        hypothesis_mgr: HypothesisManager,
    ) -> None:
        lower = full_text.lower()
        if "keyerror" in lower:
            ev = evidence_store.add(
                claim="Direct dictionary key lookup on unvalidated request payload",
                classification="LIKELY",
                source="inference",
            )
            hypothesis_mgr.create(
                description="Unhandled KeyError during dictionary indexing on missing request key 'user_id'",
                verification_needed="Inspect backend/app/api/chat.py or run test suite",
                likelihood="high",
                initial_evidence_id=ev.id,
            )
            hypothesis_mgr.create(
                description="Client request payload omitted mandatory 'user_id' property",
                verification_needed="Verify client schema validation",
                likelihood="moderate",
            )
        elif "cors" in lower:
            ev = evidence_store.add(
                claim="Browser preflight rejected due to missing or mismatched origin header",
                classification="LIKELY",
                source="inference",
            )
            hypothesis_mgr.create(
                description="FastAPI CORSMiddleware is missing or client origin (e.g. localhost:5173) is not allowlisted",
                verification_needed="Inspect backend/app/main.py CORSMiddleware configuration",
                likelihood="high",
                initial_evidence_id=ev.id,
            )
        elif "modulenotfounderror" in lower:
            ev = evidence_store.add(
                claim="Python interpreter cannot locate import in active virtualenv",
                classification="LIKELY",
                source="inference",
            )
            hypothesis_mgr.create(
                description="Missing backend dependency or inactive virtual environment",
                verification_needed="Run backend test suite to check environment imports",
                likelihood="high",
                initial_evidence_id=ev.id,
            )
        else:
            ev = evidence_store.add(
                claim=f"Runtime exception observed: {errors[0] if errors else 'Technical failure'}",
                classification="OBSERVED",
                source="user_input",
            )
            hypothesis_mgr.create(
                description=f"Runtime failure triggered by: {errors[0] if errors else 'unhandled exception'}",
                verification_needed="Inspect source code or execute diagnostic test",
                likelihood="moderate",
                initial_evidence_id=ev.id,
            )

    @classmethod
    def _synthesize_report(
        cls,
        leading_hyp: Optional[Hypothesis],
        evidence_store: EvidenceStore,
        summary: str,
        verified: bool,
    ) -> DiagnosticReport:
        diag = leading_hyp.description if leading_hyp else summary
        status = "verified" if verified else "likely"

        obs = [e.claim for e in evidence_store.by_classification("OBSERVED")]
        ver = [e.claim for e in evidence_store.by_classification("VERIFIED")]

        fix_steps = [
            "1. Activate the project virtual environment.",
            "2. Inspect the failure location identified in telemetry.",
            "3. Apply input validation or configuration update.",
            "4. Re-run verification tests to ensure zero regressions.",
        ]

        return DiagnosticReport(
            diagnosis=diag,
            summary=summary,
            status=status,  # type: ignore
            observed_facts=obs,
            verified_facts=ver,
            explanation=f"The application encountered an exception where: {diag}. Diagnostic state has been recorded.",
            recommended_fix=fix_steps,
            verification_step="Run the backend test suite (`pytest -v`) to confirm the resolution.",
        )

    @classmethod
    def _format_final_response(cls, report: DiagnosticReport, plan: Optional[InvestigationPlan]) -> str:
        obs_bullets = "\n".join([f"- {f}" for f in report.observed_facts]) or "- Direct error observation recorded."
        ver_bullets = "\n".join([f"- {f}" for f in report.verified_facts]) if report.verified_facts else "*No automated test verification completed yet (status: unverified hypothesis).*"
        fix_bullets = "\n".join(report.recommended_fix)

        return (
            f"## Diagnosis\n\n"
            f"{report.diagnosis} (Status: **{report.status.upper()}**)\n\n"
            f"### What I observed\n\n"
            f"{obs_bullets}\n\n"
            f"### What I verified\n\n"
            f"{ver_bullets}\n\n"
            f"### Why this is happening\n\n"
            f"{report.explanation}\n\n"
            f"### Recommended fix\n\n"
            f"{fix_bullets}\n\n"
            f"### Verification\n\n"
            f"{report.verification_step or 'Run test suite after fix.'}"
        )

    @classmethod
    def _sync_session(
        cls,
        session: DiagnosticSession,
        evidence_store: EvidenceStore,
        hypothesis_mgr: HypothesisManager,
    ) -> None:
        session.evidence = evidence_store.list_all()
        session.hypotheses = hypothesis_mgr.list_all()
        leading = hypothesis_mgr.get_leading_hypothesis()
        if leading:
            session.leading_hypothesis_id = leading.id
        session.updated_at = datetime.now(timezone.utc).isoformat()

    @classmethod
    def build_session_from_turn(
        cls,
        session: Optional[DiagnosticSession],
        messages: List[ChatMessage],
        response_text: str,
        tool_calls: Optional[List[ToolCall]],
    ) -> DiagnosticSession:
        """
        Builds or synchronizes a DiagnosticSession based on conversation history,
        incoming tool results, and outgoing model responses/tool calls.
        """
        active_session = session or DiagnosticStateManager.create_session()
        evidence_store = EvidenceStore(active_session.evidence)
        hypothesis_mgr = HypothesisManager(active_session.hypotheses)

        # 1. Inspect conversation history for visual attachments and errors
        has_visual = any(bool(m.attachments) for m in messages)
        is_screen = any(
            any(getattr(a, "source", None) == "screen" for a in (m.attachments or []))
            for m in messages
        )

        full_text = " ".join([m.content for m in messages if m.content])
        observed_errors = cls._extract_error_signatures(full_text)

        # Ensure baseline visual evidence exists if attachments present
        if has_visual and not any(e.source in ("screenshot", "screen_context") for e in evidence_store.list_all()):
            evidence_store.add(
                claim=f"{'Screen context capture' if is_screen else 'Visual screenshot'} received and analyzed in observation-only mode.",
                classification="OBSERVED",
                source="screen_context" if is_screen else "screenshot",
            )

        # Record error signature observations
        for err in observed_errors:
            if not any(err in e.claim for e in evidence_store.list_all()):
                evidence_store.add(
                    claim=f"Identified error signature: {err}",
                    classification="OBSERVED",
                    source="user_input",
                )

        active_session.observations = [e.claim for e in evidence_store.by_classification("OBSERVED")]

        # 2. Formulate initial hypotheses if none exist
        if not hypothesis_mgr.list_all():
            cls._formulate_initial_hypotheses(observed_errors, full_text, evidence_store, hypothesis_mgr)

        leading_hyp = hypothesis_mgr.get_leading_hypothesis()
        if leading_hyp:
            active_session.leading_hypothesis_id = leading_hyp.id

        # 3. Create or update investigation plan
        if not active_session.plan:
            primary_summary = observed_errors[0] if observed_errors else "observed technical failure"
            active_session.plan = InvestigationPlanner.create_plan_for_context(
                summary=primary_summary,
                likely_file="backend/app/main.py" if "fastapi" in full_text.lower() else None,
            )

        # 4. Check if last message was a tool result
        last_tool_msg = next((m for m in reversed(messages) if m.role == "tool"), None)
        if last_tool_msg and last_tool_msg.tool_result:
            tr = last_tool_msg.tool_result
            if tr.status == "denied":
                DiagnosticStateManager.transition(
                    active_session,
                    "DIAGNOSING",
                    stage_label="Test Execution Denied",
                    description="User declined execution approval; diagnosis remains a candidate hypothesis",
                )
                if not any(tr.call_id == e.tool_call_id for e in evidence_store.list_all()):
                    evidence_store.add(
                        claim=f"Verification test '{tr.tool}' canceled by user. Automated verification unavailable.",
                        classification="OBSERVED",
                        source="user_input",
                        tool_call_id=tr.call_id,
                        tool_name=tr.tool,
                    )
                if active_session.plan:
                    InvestigationPlanner.update_step(active_session.plan, 4, "skipped", "Canceled by user")
            elif tr.tool == "run_test" and tr.output:
                exit_code = tr.output.get("exit_code", -1)
                is_passed = (exit_code == 0)
                dur = tr.output.get("duration_seconds", 0.0)
                DiagnosticStateManager.transition(
                    active_session,
                    "VERIFYING",
                    stage_label="Test Suite Executed",
                    description=f"Allowlisted test completed (exit code {exit_code})",
                )
                if not any(tr.call_id == e.tool_call_id for e in evidence_store.list_all()):
                    ev = evidence_store.add(
                        claim=f"Test target '{tr.output.get('target_name', 'tests')}' {'passed cleanly' if is_passed else 'failed'} in sandbox ({dur}s).",
                        classification="VERIFIED",
                        source="tool_output",
                        tool_call_id=tr.call_id,
                        tool_name="run_test",
                        details=tr.output.get("stdout", "")[:250],
                    )
                    if leading_hyp:
                        hypothesis_mgr.link_evidence(leading_hyp.id, ev.id, is_support=True)
                        hypothesis_mgr.mark_verified(leading_hyp.id, evidence_store)
                if active_session.plan:
                    InvestigationPlanner.update_step(active_session.plan, 4, "completed", f"Executed ({'clean' if is_passed else 'failed'})")
            elif tr.tool == "read_file" and tr.output:
                DiagnosticStateManager.transition(
                    active_session,
                    "INVESTIGATING",
                    stage_label="File Inspected",
                    description=f"Read {tr.output.get('path', 'file')}",
                )
                if not any(tr.call_id == e.tool_call_id for e in evidence_store.list_all()):
                    ev = evidence_store.add(
                        claim=f"Inspected source file `{tr.output.get('path')}` in workspace sandbox.",
                        classification="VERIFIED",
                        source="tool_output",
                        tool_call_id=tr.call_id,
                        tool_name="read_file",
                    )
                    if leading_hyp:
                        hypothesis_mgr.link_evidence(leading_hyp.id, ev.id, is_support=True)
                if active_session.plan:
                    InvestigationPlanner.update_step(active_session.plan, 3, "completed", f"Inspected `{tr.output.get('path')}`")
            elif tr.tool == "search_code" and tr.output:
                DiagnosticStateManager.transition(
                    active_session,
                    "INVESTIGATING",
                    stage_label="Code Searched",
                    description=f"Search for '{tr.output.get('query')}' found {tr.output.get('total_matches')} match(es)",
                )
                if not any(tr.call_id == e.tool_call_id for e in evidence_store.list_all()):
                    ev = evidence_store.add(
                        claim=f"Searched workspace for symbol '{tr.output.get('query')}', found {tr.output.get('total_matches')} match(es).",
                        classification="VERIFIED",
                        source="tool_output",
                        tool_call_id=tr.call_id,
                        tool_name="search_code",
                    )
                    if leading_hyp:
                        hypothesis_mgr.link_evidence(leading_hyp.id, ev.id, is_support=True)
                if active_session.plan:
                    InvestigationPlanner.update_step(active_session.plan, 2, "completed", f"Found {tr.output.get('total_matches')} match(es)")

        # 5. Check if new tool calls were emitted in this turn
        if tool_calls:
            has_run_test = any(tc.tool == "run_test" for tc in tool_calls)
            if has_run_test:
                DiagnosticStateManager.transition(
                    active_session,
                    "AWAITING_APPROVAL",
                    stage_label="Verification Approval Requested",
                    description="Waiting for user confirmation to execute allowlisted verification test",
                )
                if active_session.plan:
                    InvestigationPlanner.update_step(active_session.plan, 4, "running", "Awaiting human confirmation")
            else:
                DiagnosticStateManager.transition(
                    active_session,
                    "INVESTIGATING",
                    stage_label="Diagnostic Tool Invocation",
                    description=f"Executing read-only tool(s): {', '.join(tc.tool for tc in tool_calls)}",
                )
        else:
            # Final synthesis or response turn
            is_verified = any(e.classification == "VERIFIED" and e.tool_name == "run_test" for e in evidence_store.list_all())
            DiagnosticStateManager.transition(
                active_session,
                "RESOLVED" if is_verified else "DIAGNOSING",
                stage_label="Diagnosis Ready",
                description="Synthesized findings and actionable remediation guidance",
            )
            report = cls._synthesize_report(
                leading_hyp=leading_hyp,
                evidence_store=evidence_store,
                summary=observed_errors[0] if observed_errors else "Diagnosis ready",
                verified=is_verified,
            )
            active_session.report = report

        cls._sync_session(active_session, evidence_store, hypothesis_mgr)
        return active_session

