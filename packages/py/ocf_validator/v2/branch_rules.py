from typing import Any

from ..codes import make_issue
from ..types import Issue
from .context import DocContextV2, is_branch, walk_actions


def _top_level_positions(top_level: list[dict[str, Any]]) -> dict[str, int]:
    """Position of every action id in flat document order (top-level only; a
    nested branch-case action's "position" for loop-direction purposes is
    defined as the position of the branch that contains it, since a loop
    target is always compared against where a case's OWN branch sits)."""
    positions: dict[str, int] = {}
    for i, item in enumerate(top_level):
        if isinstance(item.get("id"), str):
            positions[item["id"]] = i
    return positions


def branch_rules_v2(doc: dict[str, Any], ctx: DocContextV2) -> list[Issue]:
    issues: list[Issue] = []
    top_level = doc.get("actions") or []
    positions = _top_level_positions(top_level)
    any_loops_backward = False

    def _check(item: dict[str, Any], path: str) -> None:
        nonlocal any_loops_backward
        if not is_branch(item):
            return
        branch_pos = positions.get(item.get("id"))
        cases = item.get("cases") or {}
        for outcome, branch_case in cases.items():
            then = branch_case.get("then")
            if then is None:
                continue
            if then not in ctx.action_ids:
                issues.append(make_issue("REF_BRANCH_THEN_UNKNOWN", f"{path}/cases/{outcome}/then", {"ref": then}))
                continue
            # NOTE: `positions` only has top-level ids, so a `then` pointing at
            # an action nested inside a branch case yields target_pos as None
            # here and is silently skipped for loop-direction purposes (it
            # never counts toward "loops backward"), even though it is a
            # valid resolved reference. Only top-level-to-top-level `then`
            # edges are considered by this heuristic.
            target_pos = positions.get(then)
            if branch_pos is not None and target_pos is not None and target_pos < branch_pos:
                any_loops_backward = True

    walk_actions(top_level, _check)

    if doc.get("continuum") is True and not any_loops_backward:
        issues.append(make_issue("CONTINUUM_NO_LOOP_BACK", "/continuum", {}))

    return issues
