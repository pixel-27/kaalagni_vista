from typing import Literal, Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone

DiagnosticStateName = Literal[
    "IDLE",
    "OBSERVING",
    "ANALYZING",
    "FORMING_HYPOTHESES",
    "PLANNING_INVESTIGATION",
    "INVESTIGATING",
    "AWAITING_APPROVAL",
    "VERIFYING",
    "DIAGNOSING",
    "RESOLVED",
    "INCONCLUSIVE",
]

EvidenceClassification = Literal["OBSERVED", "VERIFIED", "LIKELY", "UNKNOWN"]
EvidenceSource = Literal["user_input", "screenshot", "screen_context", "tool_output", "inference"]

HypothesisStatus = Literal["candidate", "supported", "contradicted", "verified", "unresolved"]
StepStatus = Literal["pending", "running", "completed", "skipped", "failed"]
DiagnosisStatus = Literal["verified", "likely", "unresolved", "inconclusive"]
ChallengeOutcome = Literal["reaffirmed", "revised", "uncertain"]

class EvidenceItem(BaseModel):
    id: str = Field(..., description="Unique evidence ID (e.g. ev_1)")
    claim: str = Field(..., description="Concise statement of the evidence fact or finding")
    classification: EvidenceClassification = Field(..., description="Strict classification: OBSERVED, VERIFIED, LIKELY, UNKNOWN")
    source: EvidenceSource = Field(..., description="Origin of this evidence")
    tool_call_id: Optional[str] = Field(None, description="Associated tool call if obtained via tool output")
    tool_name: Optional[str] = Field(None, description="Name of the tool that produced this finding")
    details: Optional[str] = Field(None, description="Additional context or raw excerpt")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Hypothesis(BaseModel):
    id: str = Field(..., description="Unique hypothesis ID (e.g. hyp_1)")
    description: str = Field(..., description="Potential root cause or failure explanation")
    status: HypothesisStatus = Field(default="candidate", description="Evaluation status of this hypothesis")
    supporting_evidence: List[str] = Field(default_factory=list, description="IDs of evidence supporting this hypothesis")
    contradicting_evidence: List[str] = Field(default_factory=list, description="IDs of evidence contradicting this hypothesis")
    verification_needed: Optional[str] = Field(None, description="Action or tool required to confirm or refute")
    likelihood: Optional[str] = Field(None, description="Qualitative confidence assessment (e.g. high, moderate, low)")

class InvestigationStep(BaseModel):
    step_num: int = Field(..., description="Ordinal step number")
    action: str = Field(..., description="Actionable title for the diagnostic step")
    tool_needed: Optional[str] = Field(None, description="Tool name if execution is required (e.g. search_code, run_test)")
    target: Optional[str] = Field(None, description="Target argument or focus for the tool")
    status: StepStatus = Field(default="pending", description="Step progression status")
    note: Optional[str] = Field(None, description="Outcome note or observation from execution")

class InvestigationPlan(BaseModel):
    goal: str = Field(..., description="Overall diagnostic objective")
    steps: List[InvestigationStep] = Field(default_factory=list, description="Ordered investigative steps")

class DiagnosticReport(BaseModel):
    diagnosis: str = Field(..., description="Clear root cause diagnosis statement")
    summary: str = Field(..., description="High-level diagnostic summary")
    status: DiagnosisStatus = Field(default="likely", description="Verified vs likely vs unresolved status")
    observed_facts: List[str] = Field(default_factory=list, description="Concrete facts seen in logs/screen/input")
    verified_facts: List[str] = Field(default_factory=list, description="Facts verified via tool execution")
    explanation: str = Field(..., description="Why the failure occurs")
    recommended_fix: List[str] = Field(default_factory=list, description="Actionable remediation steps")
    verification_step: Optional[str] = Field(None, description="How the user or system should confirm the fix")

class ChallengeReport(BaseModel):
    challenged_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    previous_diagnosis: str = Field(..., description="The diagnosis being challenged")
    new_diagnosis: str = Field(..., description="The post-challenge assessed diagnosis")
    outcome: ChallengeOutcome = Field(..., description="reaffirmed | revised | uncertain")
    rationale: str = Field(..., description="Explanation of the second diagnostic pass findings")
    alternative_considered: str = Field(..., description="Plausible alternative root cause evaluated")
    alternative_status: str = Field(..., description="Verdict on the alternative hypothesis")

class TimelineEvent(BaseModel):
    id: str = Field(..., description="Unique event ID")
    stage: str = Field(..., description="Diagnostic milestone label")
    state: DiagnosticStateName = Field(..., description="State when event occurred")
    description: str = Field(..., description="User-facing description of event")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    status: Literal["completed", "active", "pending", "failed"] = Field(default="completed")

class DiagnosticSession(BaseModel):
    session_id: str = Field(..., description="Unique diagnostic session identifier")
    current_state: DiagnosticStateName = Field(default="IDLE", description="Current diagnostic state")
    observations: List[str] = Field(default_factory=list, description="Key raw observations gathered")
    evidence: List[EvidenceItem] = Field(default_factory=list, description="Structured evidence items")
    hypotheses: List[Hypothesis] = Field(default_factory=list, description="Formulated diagnostic hypotheses")
    leading_hypothesis_id: Optional[str] = Field(None, description="Current leading hypothesis ID")
    plan: Optional[InvestigationPlan] = Field(None, description="Active investigation plan")
    timeline: List[TimelineEvent] = Field(default_factory=list, description="Timeline of diagnostic progress")
    report: Optional[DiagnosticReport] = Field(None, description="Final or interim structured diagnosis")
    challenge: Optional[ChallengeReport] = Field(None, description="Outcome of diagnosis challenge if triggered")
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
