from ocf_validator.v2.context import build_context_v2, is_branch, walk_actions

SAMPLE_DOC = {
    "court": {"ruleset": "fiba"},
    "entities": [
        {"type": "offense", "nr": 1, "x": 0, "y": 5},
        {"type": "offense", "nr": 2, "x": 1, "y": 5},
    ],
    "balls": [{"id": "ball_1", "carried_by": "offense_1"}],
    "actions": [
        {"id": "a1", "player": "offense_1", "type": "pass", "to_player": "offense_2"},
        {
            "id": "branch_1",
            "on": "a1",
            "cases": {
                "make": {"actions": [{"id": "a2", "player": "offense_2", "type": "shoot"}], "then": None},
                "miss": {"actions": [], "then": None},
            },
        },
    ],
}


def test_build_context_v2_collects_entities_balls_ruleset():
    ctx = build_context_v2(SAMPLE_DOC)
    assert "offense_1" in ctx.entity_refs
    assert "offense_2" in ctx.entity_refs
    assert "ball_1" in ctx.ball_ids
    assert ctx.ruleset == "fiba"


def test_build_context_v2_collects_nested_branch_action_ids():
    ctx = build_context_v2(SAMPLE_DOC)
    assert "a1" in ctx.action_ids
    assert "a2" in ctx.action_ids
    assert "branch_1" in ctx.action_ids


def test_is_branch_distinguishes_action_from_branch():
    assert is_branch(SAMPLE_DOC["actions"][0]) is False
    assert is_branch(SAMPLE_DOC["actions"][1]) is True


def test_walk_actions_visits_in_order_recursing_into_cases():
    visited = []
    walk_actions(SAMPLE_DOC["actions"], lambda item, path: visited.append(f"{path}:{item['id']}"))
    assert visited == [
        "/actions/0:a1",
        "/actions/1:branch_1",
        "/actions/1/cases/make/actions/0:a2",
    ]
