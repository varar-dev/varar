"""Step role types — port of var-core/src/step-role.ts."""
from __future__ import annotations

from typing import Literal

# The role a step definition plays:
#   context — the quiescent state the software rests in
#   action  — the actuator: the single stimulus
#   sensor  — the read-only assertion (the only role that returns for comparison)
StepKind = Literal["context", "action", "sensor"]


def infer_step_role(neighbours: dict) -> StepKind:
    """Guess a step's role from its document-order neighbours.

    Purely structural — never inspects sentence words (no Given/When/Then heuristics).
    """
    before: list[StepKind] = neighbours.get("before", [])
    after: list[StepKind] = neighbours.get("after", [])

    if len(after) == 0:
        return "sensor"
    if "sensor" in after and "action" not in before and "action" not in after:
        return "action"
    if len(before) == 0:
        return "context"
    return "action"
