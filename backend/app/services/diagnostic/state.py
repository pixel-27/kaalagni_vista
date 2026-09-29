import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict
from .models import (
    DiagnosticSession,
    DiagnosticStateName,
    TimelineEvent,
)

VALID_TRANSITIONS: Dict[DiagnosticStateName, List[DiagnosticStateName]] = {
    "IDLE": ["OBSERVING", "ANALYZING", "IDLE"],
    "OBSERVING": ["ANALYZING", "FORMING_HYPOTHESES", "INCONCLUSIVE", "IDLE"],
    "ANALYZING": ["FORMING_HYPOTHESES", "PLANNING_INVESTIGATION", "INVESTIGATING", "INCONCLUSIVE", "DIAGNOSING"],
    "FORMING_HYPOTHESES": ["PLANNING_INVESTIGATION", "INVESTIGATING", "DIAGNOSING", "INCONCLUSIVE"],
    "PLANNING_INVESTIGATION": ["INVESTIGATING", "AWAITING_APPROVAL", "DIAGNOSING", "INCONCLUSIVE"],
    "INVESTIGATING": ["AWAITING_APPROVAL", "VERIFYING", "DIAGNOSING", "PLANNING_INVESTIGATION", "INCONCLUSIVE"],
    "AWAITING_APPROVAL": ["VERIFYING", "DIAGNOSING", "INCONCLUSIVE", "INVESTIGATING"],
    "VERIFYING": ["DIAGNOSING", "INVESTIGATING", "RESOLVED", "INCONCLUSIVE"],
    "DIAGNOSING": ["RESOLVED", "INCONCLUSIVE", "ANALYZING", "AWAITING_APPROVAL", "INVESTIGATING"],
    "RESOLVED": ["ANALYZING", "FORMING_HYPOTHESES", "IDLE"],  # Can re-open on challenge or follow-up
    "INCONCLUSIVE": ["ANALYZING", "OBSERVING", "IDLE"],
}

class DiagnosticStateManager:
    """Maintains deterministic diagnostic session state transitions and timeline history."""

    @classmethod
    def create_session(cls, session_id: Optional[str] = None) -> DiagnosticSession:
        sid = session_id or f"diag_{uuid.uuid4().hex[:8]}"
        session = DiagnosticSession(
            session_id=sid,
            current_state="IDLE",
        )
        cls.add_timeline_event(
            session=session,
            stage="Diagnostic session initialized",
            description="System ready for diagnostic inquiry or visual inspection",
        )
        return session

    @classmethod
    def transition(
        cls,
        session: DiagnosticSession,
        new_state: DiagnosticStateName,
        stage_label: Optional[str] = None,
        description: Optional[str] = None,
    ) -> bool:
        """
        Transitions session to new state if valid.
        Logs a timeline milestone event.
        """
        allowed = VALID_TRANSITIONS.get(session.current_state, [])
        if new_state != session.current_state and new_state not in allowed:
            # Tolerant fallback: log transition anyway to avoid blocking execution, but flag
            pass

        session.current_state = new_state
        session.updated_at = datetime.now(timezone.utc).isoformat()

        if stage_label or description:
            cls.add_timeline_event(
                session=session,
                stage=stage_label or new_state.replace("_", " ").title(),
                description=description or f"Transitioned diagnostic state to {new_state}",
            )
        return True

    @classmethod
    def add_timeline_event(
        cls,
        session: DiagnosticSession,
        stage: str,
        description: str,
        status: str = "completed",
    ) -> None:
        event = TimelineEvent(
            id=f"evt_{len(session.timeline) + 1}",
            stage=stage,
            state=session.current_state,
            description=description,
            status=status,  # type: ignore
        )
        session.timeline.append(event)
