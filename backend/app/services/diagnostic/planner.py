from typing import List, Optional
from .models import InvestigationPlan, InvestigationStep, StepStatus

class InvestigationPlanner:
    """Creates and maintains structured, user-facing diagnostic investigation plans."""

    @classmethod
    def create_plan_for_context(
        cls,
        summary: str,
        likely_file: Optional[str] = None,
        has_execution_potential: bool = True,
    ) -> InvestigationPlan:
        steps: List[InvestigationStep] = []

        # Step 1: Analyze error
        steps.append(
            InvestigationStep(
                step_num=1,
                action="Analyze error telemetry and stack trace",
                tool_needed="analyze_error",
                target=summary,
                status="completed",
                note="Extracted error signature and fault category",
            )
        )

        # Step 2: Search codebase
        steps.append(
            InvestigationStep(
                step_num=2,
                action="Search workspace for related definitions and usages",
                tool_needed="search_code",
                target="Key symbols matching error",
                status="pending",
                note=None,
            )
        )

        # Step 3: Inspect source code
        steps.append(
            InvestigationStep(
                step_num=3,
                action="Inspect source code around failure location",
                tool_needed="read_file",
                target=likely_file or "Relevant project file",
                status="pending",
                note=None,
            )
        )

        # Step 4: Verification test
        if has_execution_potential:
            steps.append(
                InvestigationStep(
                    step_num=4,
                    action="Request human approval to execute allowlisted verification test",
                    tool_needed="run_test",
                    target="backend_tests",
                    status="pending",
                    note="Mandatory user approval required before execution",
                )
            )

        # Step 5: Final synthesis
        steps.append(
            InvestigationStep(
                step_num=len(steps) + 1,
                action="Synthesize verified findings into actionable remediation guidance",
                tool_needed=None,
                target="Diagnosis",
                status="pending",
                note=None,
            )
        )

        return InvestigationPlan(
            goal=f"Isolate root cause of {summary} and provide verified resolution",
            steps=steps,
        )

    @classmethod
    def update_step(
        cls,
        plan: InvestigationPlan,
        step_num: int,
        status: StepStatus,
        note: Optional[str] = None,
    ) -> None:
        for s in plan.steps:
            if s.step_num == step_num:
                s.status = status
                if note:
                    s.note = note
                break

    @classmethod
    def get_next_pending_step(cls, plan: InvestigationPlan) -> Optional[InvestigationStep]:
        for s in plan.steps:
            if s.status == "pending":
                return s
        return None
