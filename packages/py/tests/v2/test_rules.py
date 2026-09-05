from ocf_validator.v2.context import build_context_v2
from ocf_validator.v2.rules import reference_rules_v2


def test_flags_unknown_entity_reference():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "actions": [{"id": "a1", "player": "offense_9", "type": "cut", "moves": [{"to": {"x": 1, "y": 1}}]}],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert any(i.code == "REF_ENTITY_UNKNOWN" for i in issues)


def test_flags_unknown_trigger_ref():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "move", "moves": [{"to": {"x": 1, "y": 1}}],
             "trigger": {"type": "action_end", "ref": "does_not_exist"}},
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert any(i.code == "REF_TRIGGER_ACTION_UNKNOWN" for i in issues)


def test_accepts_known_trigger_ref():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "move", "moves": [{"to": {"x": 1, "y": 1}}]},
            {"id": "a2", "player": "offense_1", "type": "move", "moves": [{"to": {"x": 2, "y": 2}}],
             "trigger": {"type": "action_end", "ref": "a1"}},
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert not any(i.code == "REF_TRIGGER_ACTION_UNKNOWN" for i in issues)


def test_flags_unknown_branch_on():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "shoot"},
            {"id": "branch_1", "on": "does_not_exist", "cases": {"make": {"actions": [], "then": None}}},
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert any(i.code == "REF_BRANCH_ON_UNKNOWN" for i in issues)


def test_flags_unknown_ball_id():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}, {"type": "offense", "nr": 2, "x": 1, "y": 5}],
        "balls": [{"id": "ball_1", "carried_by": "offense_1"}],
        "actions": [{"id": "a1", "player": "offense_1", "type": "pass", "to_player": "offense_2", "ball_id": "ball_9"}],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert any(i.code == "REF_BALL_UNKNOWN" for i in issues)


def test_checks_references_inside_nested_branch_cases():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "shoot"},
            {
                "id": "branch_1", "on": "a1",
                "cases": {"make": {"actions": [{"id": "a2", "player": "offense_9", "type": "move", "moves": [{"to": {"x": 1, "y": 1}}]}], "then": None}},
            },
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert any(i.code == "REF_ENTITY_UNKNOWN" and "/cases/make/" in i.path for i in issues)


def test_flags_unknown_entity_in_side_effects_on():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "dribble", "ball_id": "ball_1",
             "moves": [{"to": {"x": 1, "y": 1}}],
             "side_effects": [{"type": "screen", "on": "defense_9"}]},
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert any(i.code == "REF_ENTITY_UNKNOWN" and "side_effects" in i.path for i in issues)


def test_accepts_known_entity_in_side_effects_on():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}, {"type": "defense", "nr": 1, "x": 0, "y": 6}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "dribble", "ball_id": "ball_1",
             "moves": [{"to": {"x": 1, "y": 1}}],
             "side_effects": [{"type": "screen", "on": "defense_1"}]},
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert not any(i.code == "REF_ENTITY_UNKNOWN" for i in issues)


def test_flags_unknown_around_player_inside_move_step():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "dribble", "ball_id": "ball_1",
             "moves": [{"to": {"x": 1, "y": 1}, "around_player": "offense_9"}]},
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert any(i.code == "REF_ENTITY_UNKNOWN" and "around_player" in i.path for i in issues)


def test_accepts_known_around_player_inside_move_step():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}, {"type": "defense", "nr": 1, "x": 0, "y": 6}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "dribble", "ball_id": "ball_1",
             "moves": [{"to": {"x": 1, "y": 1}, "around_player": "defense_1"}]},
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert not any(i.code == "REF_ENTITY_UNKNOWN" for i in issues)
