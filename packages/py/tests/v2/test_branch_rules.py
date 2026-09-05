from ocf_validator.v2.branch_rules import branch_rules_v2
from ocf_validator.v2.context import build_context_v2


def run(doc: dict) -> list:
    return branch_rules_v2(doc, build_context_v2(doc))


def test_flags_a_then_pointing_at_an_unknown_action_id():
    doc = {
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "shoot"},
            {"id": "branch_1", "on": "a1", "cases": {"make": {"actions": [], "then": "does_not_exist"}}},
        ],
    }
    issues = run(doc)
    assert any(i.code == "REF_BRANCH_THEN_UNKNOWN" for i in issues)


def test_accepts_then_null_explicit_terminal():
    doc = {
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "shoot"},
            {"id": "branch_1", "on": "a1", "cases": {"make": {"actions": [], "then": None}}},
        ],
    }
    assert run(doc) == []


def test_accepts_then_pointing_at_a_real_earlier_action_id_loop_anchor():
    doc = {
        "actions": [
            {"id": "a0", "player": "offense_1", "type": "move", "moves": [{"to": {"x": 0, "y": 0}}]},
            {"id": "a1", "player": "offense_1", "type": "shoot"},
            {"id": "branch_1", "on": "a1", "cases": {"make": {"actions": [], "then": "a0"}}},
        ],
    }
    assert run(doc) == []


def test_warns_when_continuum_true_but_nothing_loops_backward():
    doc = {
        "continuum": True,
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "shoot"},
            {
                "id": "branch_1",
                "on": "a1",
                "cases": {
                    "make": {"actions": [], "then": None},
                    "miss": {"actions": [], "then": None},
                },
            },
        ],
    }
    issues = run(doc)
    assert any(i.code == "CONTINUUM_NO_LOOP_BACK" for i in issues)


def test_no_warning_when_continuum_true_and_a_then_loops_backward():
    doc = {
        "continuum": True,
        "actions": [
            {"id": "a0", "player": "offense_1", "type": "move", "moves": [{"to": {"x": 0, "y": 0}}]},
            {"id": "a1", "player": "offense_1", "type": "shoot"},
            {
                "id": "branch_1",
                "on": "a1",
                "cases": {
                    "make": {"actions": [], "then": "a0"},
                    "miss": {"actions": [], "then": None},
                },
            },
        ],
    }
    issues = run(doc)
    assert not any(i.code == "CONTINUUM_NO_LOOP_BACK" for i in issues)


def test_no_warning_when_continuum_is_absent_or_false():
    doc = {
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "shoot"},
            {"id": "branch_1", "on": "a1", "cases": {"make": {"actions": [], "then": None}}},
        ],
    }
    assert not any(i.code == "CONTINUUM_NO_LOOP_BACK" for i in run(doc))
