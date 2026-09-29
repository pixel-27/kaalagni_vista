from typing import List, Optional, Dict, Any
from .models import EvidenceItem, EvidenceClassification, EvidenceSource

class EvidenceStore:
    """Manages structured diagnostic evidence items with strict classification boundaries."""

    def __init__(self, initial_evidence: Optional[List[EvidenceItem]] = None):
        self._evidence: Dict[str, EvidenceItem] = {}
        self._counter: int = 0
        if initial_evidence:
            for item in initial_evidence:
                self.add_item(item)

    def add(
        self,
        claim: str,
        classification: EvidenceClassification,
        source: EvidenceSource,
        tool_call_id: Optional[str] = None,
        tool_name: Optional[str] = None,
        details: Optional[str] = None,
    ) -> EvidenceItem:
        """
        Creates and stores a new evidence item.
        Strict Quality Rule: A claim can only be VERIFIED if sourced from actual tool output
        or an explicit verified test result.
        """
        if classification == "VERIFIED" and source not in ("tool_output", "user_input"):
            # Enforce that inference cannot be labeled VERIFIED without tool backing
            classification = "LIKELY"

        self._counter += 1
        ev_id = f"ev_{self._counter}"
        item = EvidenceItem(
            id=ev_id,
            claim=claim,
            classification=classification,
            source=source,
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            details=details,
        )
        self._evidence[ev_id] = item
        return item

    def add_item(self, item: EvidenceItem) -> None:
        """Stores an existing evidence item object."""
        self._evidence[item.id] = item
        # Ensure counter stays ahead of existing ids
        if item.id.startswith("ev_"):
            try:
                num = int(item.id.split("_")[1])
                if num > self._counter:
                    self._counter = num
            except ValueError:
                pass

    def get(self, ev_id: str) -> Optional[EvidenceItem]:
        return self._evidence.get(ev_id)

    def list_all(self) -> List[EvidenceItem]:
        return list(self._evidence.values())

    def by_classification(self, classification: EvidenceClassification) -> List[EvidenceItem]:
        return [item for item in self._evidence.values() if item.classification == classification]

    def has_verified_evidence(self) -> bool:
        return any(item.classification == "VERIFIED" for item in self._evidence.values())

    def format_summary(self) -> str:
        """Generates a concise markdown bullet summary of collected evidence."""
        if not self._evidence:
            return "No evidence collected yet."

        lines = []
        for item in self._evidence.values():
            icon = "✓" if item.classification == "VERIFIED" else "●" if item.classification == "OBSERVED" else "?"
            lines.append(f"- **[{item.classification}]** {item.claim}")
        return "\n".join(lines)
