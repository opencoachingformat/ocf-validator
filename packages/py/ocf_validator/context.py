from dataclasses import dataclass
from typing import Any


@dataclass
class EntityInfo:
    type: str
    nr: int | None = None


@dataclass
class DocContext:
    entity_refs: dict[str, EntityInfo]
    ball_ids: set[str]
    frame_ids: set[str]
    ruleset: str


def _entity_ref(e: dict[str, Any]) -> str | None:
    type_ = e.get("type")
    if not type_:
        return None
    if type_ in ("ball", "coach"):
        return type_
    if "nr" in e:
        return f"{type_}_{e['nr']}"
    return type_


def get_frames(doc: dict[str, Any]) -> list[dict[str, Any]]:
    """Frames as a list; empty if absent. Shared by all rule modules."""
    frames = doc.get("frames") or []
    return [f for f in frames if isinstance(f, dict)]


def build_context(doc: dict[str, Any]) -> DocContext:
    entity_refs: dict[str, EntityInfo] = {}
    for e in doc.get("entities") or []:
        if not isinstance(e, dict):
            continue
        ref = _entity_ref(e)
        if ref:
            entity_refs[ref] = EntityInfo(type=e.get("type"), nr=e.get("nr"))
    ball_ids: set[str] = set()
    for b in doc.get("balls") or []:
        if isinstance(b, dict) and isinstance(b.get("id"), str):
            ball_ids.add(b["id"])
    frame_ids: set[str] = set()
    for f in doc.get("frames") or []:
        if isinstance(f, dict) and isinstance(f.get("id"), str):
            frame_ids.add(f["id"])
    court = doc.get("court") or {}
    ruleset = court.get("ruleset") if isinstance(court, dict) else None
    return DocContext(
        entity_refs=entity_refs,
        ball_ids=ball_ids,
        frame_ids=frame_ids,
        ruleset=ruleset or "custom",
    )
