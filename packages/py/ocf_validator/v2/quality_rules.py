import re
from typing import Any

from ..codes import make_issue
from ..types import Issue
from .context import DocContextV2

# Ported from v1/rules.py's quality_rules: ENTITY_OFFCOURT and CONTRAST_LOW read
# doc.entities and doc.color_scheme directly and have no dependency on
# frames[]/end_state, so they carry over to v2 unchanged. EMPTY_FRAME is NOT
# ported here -- it was a frames[]-specific concept (an empty top-level
# actions[] is structurally valid in v2, not a quality issue).

_FULL = {
    "fiba": {"l": 28.0, "w": 15.0},
    "nba": {"l": 94.0, "w": 50.0},
    "ncaa": {"l": 94.0, "w": 50.0},
    "nfhs": {"l": 84.0, "w": 50.0},
}


def _half_extent(court_profile: str) -> dict[str, float] | None:
    f = _FULL.get(court_profile)
    if not f:
        return None
    return {"x": f["w"] / 2, "y": f["l"] / 2}


def _rel_luminance(hex_str: str) -> float | None:
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


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


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


def quality_rules_v2(doc: dict[str, Any], ctx: DocContextV2) -> list[Issue]:
    issues: list[Issue] = []

    ext = _half_extent(ctx.court_profile)
    if ext:
        entities = doc.get("entities") or []
        for x, y in _coords(entities):
            if abs(x) > ext["x"] or abs(y) > ext["y"]:
                issues.append(
                    make_issue(
                        "ENTITY_OFFCOURT",
                        "/entities",
                        {"x": x, "y": y, "ruleset": ctx.court_profile},
                    )
                )
                break

    cs = doc.get("color_scheme")
    if isinstance(cs, dict):
        # The OCF document has no court-background color (it is renderer-dependent),
        # so we check the legibility pair that IS in the document: each player's
        # number (drawn in *_stroke) against its symbol (*_fill). Spec WCAG section.
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
