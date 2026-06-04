from ocf_validator.context import build_context
from ocf_validator.possession import possession_by_frame
from ocf_validator.rules import possession_rules, quality_rules, reference_rules


def _doc(**extra):
    base = {
        "ocf_version": "1.0",
        "type": "action",
        "entities": [
            {"type": "offense", "nr": 1},
            {"type": "offense", "nr": 2},
        ],
        "balls": [{"id": "ball_1", "carried_by": "offense_1"}],
        "frames": [],
    }
    base.update(extra)
    return base


def test_reference_unknown_entity():
    doc = _doc(
        frames=[
            {
                "id": "f1",
                "actions": [{"type": "move", "player": "offense_9"}],
                "end_state": {},
            }
        ]
    )
    ctx = build_context(doc)
    codes = {i.code for i in reference_rules(doc, ctx)}
    assert "REF_ENTITY_UNKNOWN" in codes


def test_possession_mismatch():
    # offense_2 passes but offense_1 holds the ball -> mismatch
    doc = _doc(
        frames=[
            {
                "id": "f1",
                "actions": [
                    {"type": "pass", "player": "offense_2", "to_player": "offense_1"}
                ],
                "end_state": {},
            }
        ]
    )
    ctx = build_context(doc)
    states = possession_by_frame(doc)
    codes = {i.code for i in possession_rules(doc, ctx, states)}
    assert "BALL_CARRIER_MISMATCH" in codes


def test_catch_and_shoot_clean_intra_frame():
    # offense_1 passes to offense_2, who immediately shoots in the same frame.
    # Intra-frame carrier advancement makes this clean (no mismatch).
    doc = _doc(
        frames=[
            {
                "id": "f1",
                "actions": [
                    {"type": "pass", "player": "offense_1", "to_player": "offense_2"},
                    {"type": "shoot", "player": "offense_2"},
                ],
                "end_state": {},
            }
        ]
    )
    ctx = build_context(doc)
    states = possession_by_frame(doc)
    codes = {i.code for i in possession_rules(doc, ctx, states)}
    assert "BALL_CARRIER_MISMATCH" not in codes


def test_low_fill_vs_stroke_contrast_is_contrast_low():
    doc = _doc(
        court={"ruleset": "fiba", "type": "full_court"},
        color_scheme={"offense_fill": "#fefefe", "offense_stroke": "#ffffff"},
        frames=[
            {
                "id": "f1",
                "actions": [{"type": "move", "player": "offense_1", "moves": []}],
                "end_state": {},
            }
        ],
    )
    ctx = build_context(doc)
    codes = {i.code for i in quality_rules(doc, ctx)}
    assert "CONTRAST_LOW" in codes


def test_good_fill_vs_stroke_contrast_is_clean():
    doc = _doc(
        court={"ruleset": "fiba", "type": "full_court"},
        color_scheme={"offense_fill": "#003366", "offense_stroke": "#ffffff"},
        frames=[
            {
                "id": "f1",
                "actions": [{"type": "move", "player": "offense_1", "moves": []}],
                "end_state": {},
            }
        ],
    )
    ctx = build_context(doc)
    codes = {i.code for i in quality_rules(doc, ctx)}
    assert "CONTRAST_LOW" not in codes
