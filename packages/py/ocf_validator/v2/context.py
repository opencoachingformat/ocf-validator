from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class EntityInfo:
    type: str
    nr: int | None = None


@dataclass
class DocContextV2:
    entity_refs: dict[str, EntityInfo] = field(default_factory=dict)
    ball_ids: set[str] = field(default_factory=set)
    action_ids: set[str] = field(default_factory=set)
    court_profile: str = "custom"


def _entity_ref(e: dict[str, Any]) -> str | None:
    type_ = e.get("type")
    if not type_:
        return None
    if type_ in ("ball", "coach"):
        return type_
    if "nr" in e:
        return f"{type_}_{e['nr']}"
    return type_


def is_branch(item: dict[str, Any]) -> bool:
    """A top-level actions[] item is a branch iff it has 'cases' (actions never do)."""
    return "cases" in item


def walk_actions(
    items: list[dict[str, Any]],
    visit: Callable[[dict[str, Any], str], None],
    base_path: str = "/actions",
) -> None:
    """Visit every action AND branch in document order, recursing into every
    branch case's own actions[] (which may itself contain nested branches)."""
    for i, item in enumerate(items):
        path = f"{base_path}/{i}"
        visit(item, path)
        if is_branch(item):
            cases = item.get("cases") or {}
            for outcome, branch_case in cases.items():
                nested = branch_case.get("actions") or []
                walk_actions(nested, visit, f"{path}/cases/{outcome}/actions")


def build_context_v2(doc: dict[str, Any]) -> DocContextV2:
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
    action_ids: set[str] = set()
    top_level = doc.get("actions") or []

    def _collect(item: dict[str, Any], _path: str) -> None:
        if isinstance(item.get("id"), str):
            action_ids.add(item["id"])

    walk_actions(top_level, _collect)
    court = doc.get("court") or {}
    court_profile = court.get("court_profile") if isinstance(court, dict) else None
    return DocContextV2(
        entity_refs=entity_refs,
        ball_ids=ball_ids,
        action_ids=action_ids,
        court_profile=court_profile or "custom",
    )
