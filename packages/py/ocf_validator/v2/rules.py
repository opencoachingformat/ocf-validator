from typing import Any

from ..codes import make_issue
from ..named_positions import known_named
from ..types import Issue
from .context import DocContextV2, is_branch, walk_actions

_ENTITY_KEYS = ("player", "for_player", "on_player", "to_player", "guards_player", "around_player", "off_screen_by")

# Same entity-ref keys as _ENTITY_KEYS, but checked again here because
# move_step objects (inside moves[]) carry their own around_player/
# off_screen_by, independent of any same-named key on the enclosing action
# (e.g. action_cut has both a top-level around_player default AND a per-step
# override). Both real conformance fixtures (transition-3v2.ocf.json,
# pick-and-roll.ocf.json) use the move_step-level field, so this is not
# optional — omitting it silently lets a bad move_step reference through
# with zero issues raised (caught the hard way in the TS mirror, fixed
# there in commit eeb94c9 after Task 8 shipped without it).
_MOVE_STEP_ENTITY_KEYS = ("around_player", "off_screen_by")


def _walk_named(node: Any, pointer: str, known: set[str], entity_refs: dict, out: list[Issue]) -> None:
    if isinstance(node, list):
        for i, v in enumerate(node):
            _walk_named(v, f"{pointer}/{i}", known, entity_refs, out)
    elif isinstance(node, dict):
        named = node.get("named")
        if isinstance(named, str) and named not in known:
            out.append(make_issue("REF_NAMED_POS_UNKNOWN", f"{pointer}/named", {"ref": named}))
        for key in _MOVE_STEP_ENTITY_KEYS:
            ref = node.get(key)
            if isinstance(ref, str) and ref not in entity_refs:
                out.append(make_issue("REF_ENTITY_UNKNOWN", f"{pointer}/{key}", {"ref": ref}))
        for k, v in node.items():
            _walk_named(v, f"{pointer}/{k}", known, entity_refs, out)


def reference_rules_v2(doc: dict[str, Any], ctx: DocContextV2) -> list[Issue]:
    issues: list[Issue] = []
    known = known_named(doc)
    top_level = doc.get("actions") or []

    def _check(item: dict[str, Any], path: str) -> None:
        if is_branch(item):
            on = item.get("on")
            if isinstance(on, str) and on not in ctx.action_ids:
                issues.append(make_issue("REF_BRANCH_ON_UNKNOWN", f"{path}/on", {"ref": on}))
            return
        for key in _ENTITY_KEYS:
            ref = item.get(key)
            if isinstance(ref, str) and ref not in ctx.entity_refs:
                issues.append(make_issue("REF_ENTITY_UNKNOWN", f"{path}/{key}", {"ref": ref}))
        ball_id = item.get("ball_id")
        if isinstance(ball_id, str) and ball_id not in ctx.ball_ids:
            issues.append(make_issue("REF_BALL_UNKNOWN", f"{path}/ball_id", {"ref": ball_id}))
        ball_ids = item.get("ball_ids")
        if isinstance(ball_ids, list):
            for i, bid in enumerate(ball_ids):
                if isinstance(bid, str) and bid not in ctx.ball_ids:
                    issues.append(make_issue("REF_BALL_UNKNOWN", f"{path}/ball_ids/{i}", {"ref": bid}))
        trigger = item.get("trigger")
        if isinstance(trigger, dict):
            ref = trigger.get("ref")
            if isinstance(ref, str) and ref not in ctx.action_ids:
                issues.append(make_issue("REF_TRIGGER_ACTION_UNKNOWN", f"{path}/trigger/ref", {"ref": ref}))
        _walk_named(item.get("moves"), f"{path}/moves", known, ctx.entity_refs, issues)

        side_effects = item.get("side_effects")
        if isinstance(side_effects, list):
            for i, se in enumerate(side_effects):
                on_ref = se.get("on") if isinstance(se, dict) else None
                if isinstance(on_ref, str) and on_ref not in ctx.entity_refs:
                    issues.append(make_issue("REF_ENTITY_UNKNOWN", f"{path}/side_effects/{i}/on", {"ref": on_ref}))

    walk_actions(top_level, _check)
    return issues
