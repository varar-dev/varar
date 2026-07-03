"""Step role types — port of var-core/src/step-role.ts."""
from __future__ import annotations

from typing import Literal

# The role a step definition plays:
#   stimulus — drives the software: arranges the quiescent state AND acts on it
#   sensor   — the read-only assertion (the only role that returns for comparison)
# The concepts arrange/act (given/when) remain useful narration in a document,
# but they share one mechanism: a stimulus evolves state, a sensor observes it.
StepKind = Literal["stimulus", "sensor"]


def infer_step_role(neighbours: dict) -> StepKind:
    """Guess a step's role from its document-order neighbours.

    Purely structural — never inspects sentence words (no Given/When/Then
    heuristics). A step with nothing after it is most likely the observation;
    anything followed by other steps is most likely driving the software.
    """
    after: list[StepKind] = neighbours.get("after", [])
    return "sensor" if len(after) == 0 else "stimulus"
