from typing import List, Optional, Dict
from .models import Hypothesis, HypothesisStatus
from .evidence import EvidenceStore

class HypothesisManager:
    """Manages diagnostic hypotheses, supporting/contradicting evidence links, and state transitions."""

    def __init__(self, initial_hypotheses: Optional[List[Hypothesis]] = None):
        self._hypotheses: Dict[str, Hypothesis] = {}
        self._counter: int = 0
        if initial_hypotheses:
            for hyp in initial_hypotheses:
                self.add_item(hyp)

    def create(
        self,
        description: str,
        verification_needed: Optional[str] = None,
        likelihood: Optional[str] = "moderate",
        initial_evidence_id: Optional[str] = None,
    ) -> Hypothesis:
        self._counter += 1
        hyp_id = f"hyp_{self._counter}"
        supporting = [initial_evidence_id] if initial_evidence_id else []
        hyp = Hypothesis(
            id=hyp_id,
            description=description,
            status="candidate",
            supporting_evidence=supporting,
            contradicting_evidence=[],
            verification_needed=verification_needed,
            likelihood=likelihood,
        )
        self._hypotheses[hyp_id] = hyp
        return hyp

    def add_item(self, hyp: Hypothesis) -> None:
        self._hypotheses[hyp.id] = hyp
        if hyp.id.startswith("hyp_"):
            try:
                num = int(hyp.id.split("_")[1])
                if num > self._counter:
                    self._counter = num
            except ValueError:
                pass

    def get(self, hyp_id: str) -> Optional[Hypothesis]:
        return self._hypotheses.get(hyp_id)

    def list_all(self) -> List[Hypothesis]:
        return list(self._hypotheses.values())

    def link_evidence(self, hyp_id: str, evidence_id: str, is_support: bool = True) -> None:
        hyp = self._hypotheses.get(hyp_id)
        if not hyp:
            return

        if is_support:
            if evidence_id not in hyp.supporting_evidence:
                hyp.supporting_evidence.append(evidence_id)
            if hyp.status == "candidate":
                hyp.status = "supported"
        else:
            if evidence_id not in hyp.contradicting_evidence:
                hyp.contradicting_evidence.append(evidence_id)
            hyp.status = "contradicted"

    def mark_verified(self, hyp_id: str, evidence_store: EvidenceStore) -> bool:
        """
        Marks hypothesis as verified only if at least one linked supporting evidence
        has a classification of VERIFIED.
        """
        hyp = self._hypotheses.get(hyp_id)
        if not hyp:
            return False

        has_verified_support = False
        for ev_id in hyp.supporting_evidence:
            ev = evidence_store.get(ev_id)
            if ev and ev.classification == "VERIFIED":
                has_verified_support = True
                break

        if has_verified_support and not hyp.contradicting_evidence:
            hyp.status = "verified"
            hyp.likelihood = "high"
            return True

        # Otherwise stays supported if evidence exists, or unresolved
        return False

    def get_leading_hypothesis(self) -> Optional[Hypothesis]:
        """Returns the most credible hypothesis based on status and evidence count."""
        if not self._hypotheses:
            return None

        # Prefer verified first
        verified = [h for h in self._hypotheses.values() if h.status == "verified"]
        if verified:
            return verified[0]

        # Then supported without contradiction
        supported = [h for h in self._hypotheses.values() if h.status == "supported" and not h.contradicting_evidence]
        if supported:
            # Sort by number of supporting evidence
            supported.sort(key=lambda h: len(h.supporting_evidence), reverse=True)
            return supported[0]

        # Then candidates
        candidates = [h for h in self._hypotheses.values() if h.status in ("candidate", "unresolved")]
        if candidates:
            return candidates[0]

        return list(self._hypotheses.values())[0]
