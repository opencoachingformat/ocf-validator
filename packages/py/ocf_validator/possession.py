from typing import Any

from .context import get_frames


class FrameState:
    """Per-frame entering snapshot: ball_id -> {carried_by, at, dead}."""

    def __init__(self, balls: dict[str, dict[str, Any]]):
        self._balls = balls

    @property
    def ball_count(self) -> int:
        return len([b for b in self._balls.values() if not b.get("dead")])

    def carrier_of(self, ball_id: str) -> str | None:
        b = self._balls.get(ball_id)
        return b.get("carried_by") if b else None

    def loose_at(self, ball_id: str) -> dict[str, Any] | None:
        b = self._balls.get(ball_id)
        return b.get("at") if b else None


# Free-function helpers (per the task contract).
def carrier_of(state: FrameState, ball_id: str) -> str | None:
    return state.carrier_of(ball_id)


def loose_at(state: FrameState, ball_id: str) -> dict[str, Any] | None:
    return state.loose_at(ball_id)


def possession_by_frame(doc: dict[str, Any]) -> list[FrameState]:
    current: dict[str, dict[str, Any]] = {}
    for b in doc.get("balls") or []:
        if isinstance(b, dict) and isinstance(b.get("id"), str):
            current[b["id"]] = {
                "carried_by": b.get("carried_by"),
                "at": b.get("at"),
                "dead": b.get("dead"),
            }

    states: list[FrameState] = []
    for frame in get_frames(doc):
        # Snapshot current state (entering this frame) — deep-ish copy so later
        # mutations don't backfill.
        states.append(FrameState({k: dict(v) for k, v in current.items()}))
        # Apply end_state.balls to current for next frame.
        end_balls = (frame.get("end_state") or {}).get("balls")
        if isinstance(end_balls, dict):
            for bid, st in end_balls.items():
                current[bid] = dict(st) if isinstance(st, dict) else {}
    return states
