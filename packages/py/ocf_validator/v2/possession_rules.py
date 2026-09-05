from typing import Any

from ..codes import make_issue
from ..types import Issue
from .context import DocContextV2, is_branch

_BALL_DEPENDENT = {"pass", "shoot", "dribble"}
_PICKUP = {"pickup", "rebound"}
_NO_BALL_MOVEMENT = {"move", "cut"}

# screen/defend/tackle/faceoff/check are intentionally untracked here: none
# carries a ball_id in the schema, so there is no possession effect to apply
# or check for them (this differs from _NO_BALL_MOVEMENT, which actively
# checks that the actor is NOT holding a ball; these five get no check at
# all, since a screen/defend/etc. isn't disqualified by holding a ball).
# action_clear ALSO has a ball_id (an invasion-sport ball-clearing action)
# and would otherwise fit _BALL_DEPENDENT's shape, but is left untracked
# deliberately: the schema itself $comments it "Reserved for invasion sports
# ... No variants defined yet" (schema/v1.json, action_clear) -- i.e. it's a
# placeholder type with no finalized semantics yet, not a basketball action
# this validator currently needs to support. Revisit once invasion-sport
# action types are promoted out of "reserved" status.

_AMBIGUOUS = "AMBIGUOUS"


def _resolve_ball_ids(action: dict[str, Any], ctx: DocContextV2) -> list[str] | str:
    """Resolved ball ids, or the sentinel "AMBIGUOUS" (not real ball ids) when
    neither ball_id nor ball_ids is given and multiple balls exist in the
    document. Mirrors v1's _resolve_ball_id (single ball in doc -> assume it;
    zero balls -> no check; 2+ balls with nothing given -> AMBIGUOUS),
    extended for v2's ball_ids (plural, two-ball dribble) form."""
    bid = action.get("ball_id")
    if isinstance(bid, str):
        return [bid]
    bids = action.get("ball_ids")
    if isinstance(bids, list):
        ids = [b for b in bids if isinstance(b, str)]
        if ids:
            return ids
    if len(ctx.ball_ids) == 1:
        return list(ctx.ball_ids)
    if len(ctx.ball_ids) == 0:
        return []
    return _AMBIGUOUS


def _player_holds_any_ball(player: str, carrier: dict[str, str | None]) -> bool:
    return any(holder == player for holder in carrier.values())


def _apply_effect(
    type_: str,
    player: str,
    action: dict[str, Any],
    ball_ids: list[str],
    carrier: dict[str, str | None],
    loose: set[str],
) -> None:
    for ball in ball_ids:
        if type_ == "pass":
            to = action.get("to_player")
            carrier[ball] = to if isinstance(to, str) else None
            loose.discard(ball)
        elif type_ == "shoot":
            carrier[ball] = None
            loose.discard(ball)
        elif type_ in ("pickup", "rebound"):
            carrier[ball] = player
            loose.discard(ball)
        # `dribble` keeps the same carrier -- no change.


def possession_rules_v2(doc: dict[str, Any], ctx: DocContextV2) -> list[Issue]:
    issues: list[Issue] = []

    carrier: dict[str, str | None] = {}
    loose: set[str] = set()
    for b in doc.get("balls") or []:
        if not isinstance(b, dict):
            continue
        bid = b.get("id")
        if not isinstance(bid, str):
            continue
        carried_by = b.get("carried_by")
        carrier[bid] = carried_by if isinstance(carried_by, str) else None
        if b.get("at") is not None:
            loose.add(bid)

    def _check_and_apply(
        item: dict[str, Any],
        path: str,
        local_carrier: dict[str, str | None],
        local_loose: set[str],
    ) -> None:
        if is_branch(item):
            cases = item.get("cases") or {}
            for outcome, branch_case in cases.items():
                # Fork state per case: each outcome is a hypothetical alternate
                # continuation, not a sequential extension shared with sibling
                # cases. A case's fork is also a dead end for possession
                # purposes: we never merge it back into the top-level walk
                # after the branch returns, so the top-level sequence
                # continues from its own pre-branch state, oblivious to what
                # any case did. `then` (resuming the flat sequence at an
                # earlier/later action id) is a control-flow construct
                # handled elsewhere, not a possession-state merge point.
                forked_carrier = dict(local_carrier)
                forked_loose = set(local_loose)
                nested = branch_case.get("actions") or []
                for i, child in enumerate(nested):
                    _check_and_apply(child, f"{path}/cases/{outcome}/actions/{i}", forked_carrier, forked_loose)
            return

        type_ = item.get("type")
        player = item.get("player")

        if type_ in _NO_BALL_MOVEMENT and _player_holds_any_ball(player, local_carrier):
            issues.append(make_issue("BALL_CARRIER_MISMATCH", path, {"player": player, "action": type_}))
            return

        if type_ in _BALL_DEPENDENT:
            ball_ids = _resolve_ball_ids(item, ctx)
            if ball_ids == _AMBIGUOUS:
                issues.append(make_issue("BALL_AMBIGUOUS", path, {"player": player, "count": len(ctx.ball_ids)}))
                return
            for ball in ball_ids:
                if local_carrier.get(ball) != player:
                    issues.append(
                        make_issue("BALL_CARRIER_MISMATCH", path, {"player": player, "action": type_, "ball_id": ball})
                    )
            info = ctx.entity_refs.get(player)
            if info and info.type == "defense":
                issues.append(make_issue("ACTION_UNUSUAL_CARRIER", path, {"player": player, "action": type_}))
            _apply_effect(type_, player, item, ball_ids, local_carrier, local_loose)
        elif type_ in _PICKUP:
            ball_ids = _resolve_ball_ids(item, ctx)
            if ball_ids == _AMBIGUOUS:
                issues.append(make_issue("BALL_AMBIGUOUS", path, {"player": player, "count": len(ctx.ball_ids)}))
                return
            for ball in ball_ids:
                if ball not in local_loose:
                    issues.append(make_issue("BALL_NOT_AT_LOCATION", path, {"player": player, "action": type_}))
                else:
                    _apply_effect(type_, player, item, [ball], local_carrier, local_loose)

    top_level = doc.get("actions") or []
    for i, item in enumerate(top_level):
        _check_and_apply(item, f"/actions/{i}", carrier, loose)

    return issues
