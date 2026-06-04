from typing import Any

from .codes import make_issue
from .context import DocContext, get_frames
from .named_positions import known_named
from .possession import FrameState
from .types import Issue

# ----------------------------------------------------------------------------
# Reference-integrity rules
# ----------------------------------------------------------------------------

_ENTITY_KEYS = ("player", "for_player", "on_player", "to_player")


def _walk_named(
    node: Any,
    pointer: str,
    known: set[str],
    frame_id: str | None,
    out: list[Issue],
) -> None:
    if isinstance(node, list):
        for i, v in enumerate(node):
            _walk_named(v, f"{pointer}/{i}", known, frame_id, out)
    elif isinstance(node, dict):
        named = node.get("named")
        if isinstance(named, str) and named not in known:
            out.append(
                make_issue(
                    "REF_NAMED_POS_UNKNOWN", f"{pointer}/named", {"ref": named}, frame_id
                )
            )
        for k, v in node.items():
            _walk_named(v, f"{pointer}/{k}", known, frame_id, out)


def reference_rules(doc: dict[str, Any], ctx: DocContext) -> list[Issue]:
    issues: list[Issue] = []
    frames = get_frames(doc)
    known = known_named(doc)

    for fi, frame in enumerate(frames):
        frame_id = frame.get("id")
        actions = frame.get("actions") or []
        for ai, action in enumerate(actions):
            if not isinstance(action, dict):
                continue
            for key in _ENTITY_KEYS:
                ref = action.get(key)
                if isinstance(ref, str) and ref not in ctx.entity_refs:
                    issues.append(
                        make_issue(
                            "REF_ENTITY_UNKNOWN",
                            f"/frames/{fi}/actions/{ai}/{key}",
                            {"ref": ref},
                            frame_id,
                        )
                    )
            ball_id = action.get("ball_id")
            if isinstance(ball_id, str) and ball_id not in ctx.ball_ids:
                issues.append(
                    make_issue(
                        "REF_BALL_UNKNOWN",
                        f"/frames/{fi}/actions/{ai}/ball_id",
                        {"ref": ball_id},
                        frame_id,
                    )
                )
        branches = frame.get("branches") or {}
        if isinstance(branches, dict):
            for outcome, target in branches.items():
                if isinstance(target, str) and target not in ctx.frame_ids:
                    issues.append(
                        make_issue(
                            "REF_BRANCH_TARGET_UNKNOWN",
                            f"/frames/{fi}/branches/{outcome}",
                            {"outcome": outcome, "ref": target},
                            frame_id,
                        )
                    )
        _walk_named(frame.get("actions"), f"/frames/{fi}/actions", known, frame_id, issues)
        _walk_named(frame.get("end_state"), f"/frames/{fi}/end_state", known, frame_id, issues)
        _walk_named(frame.get("start_state"), f"/frames/{fi}/start_state", known, frame_id, issues)
    return issues


# ----------------------------------------------------------------------------
# Ball-possession rules (with intra-frame carrier advancement)
# ----------------------------------------------------------------------------

_BALL_DEPENDENT = {"pass", "shoot", "dribble"}
_PICKUP = {"pickup", "rebound"}

_AMBIGUOUS = "AMBIGUOUS"


def _resolve_ball_id(action: dict[str, Any], ctx: DocContext) -> str | None:
    """Resolved ball id, or the sentinel "AMBIGUOUS" when ball_id is omitted
    with multiple balls, or None when no ball exists."""
    bid = action.get("ball_id")
    if isinstance(bid, str):
        return bid
    if len(ctx.ball_ids) == 1:
        return next(iter(ctx.ball_ids))
    if len(ctx.ball_ids) == 0:
        return None
    return _AMBIGUOUS


def _apply_effect(
    type_: str,
    player: str,
    action: dict[str, Any],
    ball: str,
    carrier: dict[str, str | None],
    loose: set[str],
) -> None:
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
    # `dribble` keeps the same carrier — no change.


def possession_rules(
    doc: dict[str, Any], ctx: DocContext, states: list[FrameState]
) -> list[Issue]:
    issues: list[Issue] = []
    frames = get_frames(doc)

    for fi, frame in enumerate(frames):
        frame_id = frame.get("id")
        state = states[fi]
        actions = frame.get("actions") or []

        # Seed a mutable carrier map from the frame-start snapshot and advance it
        # as we walk the actions, so "currently carries" is evaluated at the point
        # each action runs — not only at frame entry.
        carrier: dict[str, str | None] = {}
        loose: set[str] = set()
        for bid in ctx.ball_ids:
            carrier[bid] = state.carrier_of(bid)
            if state.loose_at(bid) is not None:
                loose.add(bid)

        for ai, action in enumerate(actions):
            if not isinstance(action, dict):
                continue
            type_ = action.get("type")
            player = action.get("player")
            path = f"/frames/{fi}/actions/{ai}"

            if type_ in _BALL_DEPENDENT:
                ball = _resolve_ball_id(action, ctx)
                if ball == _AMBIGUOUS:
                    issues.append(
                        make_issue(
                            "BALL_AMBIGUOUS",
                            path,
                            {"player": player, "count": len(ctx.ball_ids)},
                            frame_id,
                        )
                    )
                    continue
                if ball and carrier.get(ball) != player:
                    issues.append(
                        make_issue(
                            "BALL_CARRIER_MISMATCH",
                            path,
                            {"player": player, "action": type_, "ball_id": ball},
                            frame_id,
                        )
                    )
                info = ctx.entity_refs.get(player)
                if info and info.type == "defense":
                    issues.append(
                        make_issue(
                            "ACTION_UNUSUAL_CARRIER",
                            path,
                            {"player": player, "action": type_},
                            frame_id,
                        )
                    )
                if ball:
                    _apply_effect(type_, player, action, ball, carrier, loose)
            elif type_ in _PICKUP:
                ball = _resolve_ball_id(action, ctx)
                if ball == _AMBIGUOUS:
                    issues.append(
                        make_issue(
                            "BALL_AMBIGUOUS",
                            path,
                            {"player": player, "count": len(ctx.ball_ids)},
                            frame_id,
                        )
                    )
                elif ball and ball not in loose:
                    issues.append(
                        make_issue(
                            "BALL_NOT_AT_LOCATION",
                            path,
                            {"player": player, "action": type_},
                            frame_id,
                        )
                    )
                elif ball:
                    _apply_effect(type_, player, action, ball, carrier, loose)
    return issues


# ----------------------------------------------------------------------------
# Coherence rules
# ----------------------------------------------------------------------------


def _coord_key(c: Any) -> str | None:
    if not isinstance(c, dict):
        return None
    named = c.get("named")
    if isinstance(named, str):
        return f"named:{named}"
    x, y = c.get("x"), c.get("y")
    if _is_number(x) and _is_number(y):
        return f"xy:{x},{y}"
    return None


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _same_namespace(a: str, b: str) -> bool:
    return (a.startswith("named:") and b.startswith("named:")) or (
        a.startswith("xy:") and b.startswith("xy:")
    )


def coherence_rules(doc: dict[str, Any], _ctx: DocContext) -> list[Issue]:
    issues: list[Issue] = []
    frames = get_frames(doc)

    for fi, frame in enumerate(frames):
        frame_id = frame.get("id")
        end_state = frame.get("end_state") or {}
        actions = frame.get("actions") or []

        # Compare end_state against each player's LAST explicit-endpoint move only.
        last_endpoint: dict[str, Any] = {}
        for action in actions:
            if not isinstance(action, dict):
                continue
            player = action.get("player")
            if not player:
                continue
            moves = action.get("moves")
            if not isinstance(moves, list) or len(moves) == 0:
                continue
            last = moves[-1]
            last_to = last.get("to") if isinstance(last, dict) else None
            if last_to is not None:
                last_endpoint[player] = last_to
        for player, last_to in last_endpoint.items():
            if player not in end_state:
                continue
            end_key = _coord_key(end_state.get(player))
            to_key = _coord_key(last_to)
            if end_key and to_key and _same_namespace(end_key, to_key) and end_key != to_key:
                issues.append(
                    make_issue(
                        "END_STATE_DISAGREE",
                        f"/frames/{fi}/end_state/{player}",
                        {"ref": player},
                        frame_id,
                    )
                )

        if fi + 1 < len(frames):
            nxt = frames[fi + 1]
            start = nxt.get("start_state") or {}
            if isinstance(start, dict):
                for ref, coord in start.items():
                    if ref == "balls":
                        continue
                    a = _coord_key(coord)
                    b = _coord_key(end_state.get(ref))
                    if a and b and _same_namespace(a, b) and a != b:
                        issues.append(
                            make_issue(
                                "START_STATE_DISCONTINUITY",
                                f"/frames/{fi + 1}/start_state/{ref}",
                                {"ref": ref},
                                nxt.get("id"),
                            )
                        )
    return issues


# ----------------------------------------------------------------------------
# Quality rules
# ----------------------------------------------------------------------------

_FULL = {
    "fiba": {"l": 28.0, "w": 15.0},
    "nba": {"l": 94.0, "w": 50.0},
    "ncaa": {"l": 94.0, "w": 50.0},
    "nfhs": {"l": 84.0, "w": 50.0},
}


def _half_extent(ruleset: str) -> dict[str, float] | None:
    f = _FULL.get(ruleset)
    if not f:
        return None
    return {"x": f["w"] / 2, "y": f["l"] / 2}


def _rel_luminance(hex_str: str) -> float | None:
    import re

    m = re.fullmatch(r"#?([0-9a-fA-F]{6})", hex_str)
    if not m:
        return None
    n = int(m.group(1), 16)
    channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    lin = []
    for c in channels:
        s = c / 255
        lin.append(s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4)
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def _contrast(a: str, b: str) -> float | None:
    la, lb = _rel_luminance(a), _rel_luminance(b)
    if la is None or lb is None:
        return None
    hi, lo = (la, lb) if la >= lb else (lb, la)
    return (hi + 0.05) / (lo + 0.05)


def _coords(node: Any):
    if isinstance(node, list):
        for v in node:
            yield from _coords(v)
    elif isinstance(node, dict):
        x, y = node.get("x"), node.get("y")
        if _is_number(x) and _is_number(y):
            yield (x, y)
        for v in node.values():
            yield from _coords(v)


def quality_rules(doc: dict[str, Any], ctx: DocContext) -> list[Issue]:
    issues: list[Issue] = []

    ext = _half_extent(ctx.ruleset)
    if ext:
        entities = doc.get("entities") or []
        for x, y in _coords(entities):
            if abs(x) > ext["x"] or abs(y) > ext["y"]:
                issues.append(
                    make_issue(
                        "ENTITY_OFFCOURT",
                        "/entities",
                        {"x": x, "y": y, "ruleset": ctx.ruleset},
                    )
                )
                break

    frames = get_frames(doc)
    for fi, frame in enumerate(frames):
        actions = frame.get("actions") or []
        end_state = frame.get("end_state") or {}
        if len(actions) == 0 and len(end_state) == 0:
            issues.append(make_issue("EMPTY_FRAME", f"/frames/{fi}", {}, frame.get("id")))

    cs = doc.get("color_scheme")
    if isinstance(cs, dict):
        # No court-background color in the document (renderer-dependent); check the
        # legibility pair that IS present: each player's number (*_stroke) on its
        # symbol (*_fill). Spec WCAG section.
        for fill_role, stroke_role in (
            ("offense_fill", "offense_stroke"),
            ("defense_fill", "defense_stroke"),
        ):
            fill, stroke = cs.get(fill_role), cs.get(stroke_role)
            if not isinstance(fill, str) or not isinstance(stroke, str):
                continue
            ratio = _contrast(fill, stroke)
            if ratio is not None and ratio < 4.5:
                issues.append(
                    make_issue(
                        "CONTRAST_LOW",
                        f"/color_scheme/{fill_role}",
                        {"ref": f"{fill_role} vs {stroke_role}", "ratio": f"{ratio:.2f}"},
                    )
                )
    return issues
