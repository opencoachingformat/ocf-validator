from ocf_validator.v2.context import build_context_v2
from ocf_validator.v2.possession_rules import possession_rules_v2


def run(doc: dict) -> list:
    return possession_rules_v2(doc, build_context_v2(doc))


def test_flags_a_move_by_the_current_ball_carrier():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "balls": [{"id": "ball_1", "carried_by": "offense_1"}],
        "actions": [{"id": "a1", "player": "offense_1", "type": "move", "moves": [{"to": {"x": 1, "y": 1}}]}],
    }
    issues = run(doc)
    assert any(i.code in ("BALL_CARRIER_MISMATCH", "POSSESSION_INVALID_MOVE") for i in issues)


def test_allows_a_move_by_a_player_not_carrying_the_ball():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}, {"type": "offense", "nr": 2, "x": 1, "y": 5}],
        "balls": [{"id": "ball_1", "carried_by": "offense_1"}],
        "actions": [{"id": "a1", "player": "offense_2", "type": "move", "moves": [{"to": {"x": 2, "y": 2}}]}],
    }
    issues = run(doc)
    assert issues == []


def test_possession_transfers_after_a_pass_and_dribble_by_new_carrier_is_fine():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}, {"type": "offense", "nr": 2, "x": 1, "y": 5}],
        "balls": [{"id": "ball_1", "carried_by": "offense_1"}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "pass", "to_player": "offense_2", "ball_id": "ball_1"},
            {
                "id": "a2", "player": "offense_2", "type": "dribble", "ball_id": "ball_1",
                "moves": [{"to": {"x": 3, "y": 3}}], "trigger": {"type": "reception"},
            },
        ],
    }
    issues = run(doc)
    assert issues == []


def test_a_pass_by_a_non_carrier_is_flagged():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}, {"type": "offense", "nr": 2, "x": 1, "y": 5}],
        "balls": [{"id": "ball_1", "carried_by": "offense_1"}],
        "actions": [{"id": "a1", "player": "offense_2", "type": "pass", "to_player": "offense_1", "ball_id": "ball_1"}],
    }
    issues = run(doc)
    assert any(i.code == "BALL_CARRIER_MISMATCH" for i in issues)


def test_two_ball_dribble_ball_ids_is_not_flagged_as_invalid_movement():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "balls": [{"id": "ball_1", "carried_by": "offense_1"}, {"id": "ball_2", "carried_by": "offense_1"}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "dribble", "ball_ids": ["ball_1", "ball_2"],
             "moves": [{"to": {"x": 1, "y": 1}}]},
        ],
    }
    issues = run(doc)
    assert issues == []


def test_a_branchs_miss_case_does_not_see_the_make_cases_carrier_changes():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}, {"type": "offense", "nr": 2, "x": 1, "y": 5}],
        "balls": [{"id": "ball_1", "carried_by": "offense_1"}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "shoot", "ball_id": "ball_1"},
            {
                "id": "branch_1", "on": "a1",
                "cases": {
                    "make": {
                        "actions": [
                            {"id": "a2", "player": "offense_2", "type": "pass", "to_player": "offense_1", "ball_id": "ball_1"},
                        ],
                        "then": None,
                    },
                    "miss": {
                        # offense_1 still "shot" the ball (possession-wise, ball left them on
                        # shoot), so offense_2 passing ball_1 here (which they never had) should
                        # ALSO be flagged as BALL_CARRIER_MISMATCH -- proving miss's state is
                        # independent of make's.
                        "actions": [
                            {"id": "a3", "player": "offense_2", "type": "pass", "to_player": "offense_1", "ball_id": "ball_1"},
                        ],
                        "then": None,
                    },
                },
            },
        ],
    }
    issues = run(doc)
    # Paths are positional JSON pointers (never literal action ids), so the miss
    # case's a3 action is addressed as /actions/1/cases/miss/actions/0.
    miss_issue = next(
        (i for i in issues if i.code == "BALL_CARRIER_MISMATCH" and i.path == "/actions/1/cases/miss/actions/0"),
        None,
    )
    assert miss_issue is not None


def test_omitting_ball_id_with_two_balls_is_ball_ambiguous():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "balls": [{"id": "ball_1", "carried_by": "offense_1"}, {"id": "ball_2", "at": {"x": 3, "y": 3}}],
        "actions": [{"id": "a1", "player": "offense_1", "type": "dribble", "moves": []}],
    }
    assert any(i.code == "BALL_AMBIGUOUS" for i in run(doc))


def test_a_grandchild_branch_case_does_not_see_a_siblings_or_great_uncles_carrier_changes():
    doc = {
        "entities": [
            {"type": "offense", "nr": 1, "x": 0, "y": 5}, {"type": "offense", "nr": 2, "x": 1, "y": 5},
            {"type": "offense", "nr": 3, "x": 2, "y": 5},
        ],
        "balls": [{"id": "ball_1", "carried_by": "offense_1"}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "pass", "to_player": "offense_2", "ball_id": "ball_1"},
            {
                "id": "branch_1", "on": "a1",
                "cases": {
                    "make": {
                        "actions": [
                            {
                                "id": "branch_2", "on": "a1",
                                "cases": {
                                    "hit": {
                                        "actions": [
                                            {"id": "a3", "player": "offense_2", "type": "pass",
                                             "to_player": "offense_3", "ball_id": "ball_1"},
                                        ],
                                        "then": None,
                                    },
                                    "miss": {
                                        # Both grandchild cases fork from the same post-a1 state
                                        # (offense_2 holds ball_1 after the pass), so this dribble is
                                        # valid too. What must NOT leak across is the sibling "hit"
                                        # case's post-fork mutation (the pass to offense_3) -- if
                                        # state were shared instead of forked, this dribble would
                                        # incorrectly see ball_1 as no longer offense_2's.
                                        "actions": [
                                            {"id": "a4", "player": "offense_2", "type": "dribble",
                                             "ball_id": "ball_1", "moves": []},
                                        ],
                                        "then": None,
                                    },
                                },
                            },
                        ],
                        "then": None,
                    },
                    "miss": {
                        # The "miss" great-uncle case still forks from a1's own post-pass state
                        # (offense_2 holds ball_1), same as "make" -- so this dribble is ALSO valid.
                        # It exists to prove branch_1's "miss" gets its own independent fork rather
                        # than accidentally sharing branch_2's nested state.
                        "actions": [
                            {"id": "a5", "player": "offense_2", "type": "dribble", "ball_id": "ball_1", "moves": []},
                        ],
                        "then": None,
                    },
                },
            },
        ],
    }
    issues = run(doc)
    # All three leaf actions (a3 pass, a4 dribble, a5 dribble) see offense_2 holding
    # ball_1 from their shared ancestor a1 -- none should be flagged, since each fork
    # independently derives from the same pre-branch state, not from a sibling. This
    # genuinely discriminates forking from shared-reference state: verified (in the TS
    # original, via a throwaway local mutation of the implementation under test) that
    # sharing local_carrier/local_loose by reference instead of copying makes a3's
    # pass-away-from-offense_2 leak into BOTH a4 (sibling grandchild) and a5 (great-uncle),
    # incorrectly flagging both as BALL_CARRIER_MISMATCH.
    assert not any(i.path == "/actions/1/cases/make/actions/0/cases/hit/actions/0" for i in issues)
    assert not any(i.path == "/actions/1/cases/make/actions/0/cases/miss/actions/0" for i in issues)
    assert not any(i.path == "/actions/1/cases/miss/actions/0" for i in issues)
    assert issues == []


def test_a_successful_pickup_transfers_a_loose_ball_to_the_picking_player():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "balls": [{"id": "ball_1", "at": {"x": 0, "y": 5}}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "pickup", "ball_id": "ball_1", "moves": []},
            {"id": "a2", "player": "offense_1", "type": "dribble", "ball_id": "ball_1", "moves": [{"to": {"x": 1, "y": 1}}]},
        ],
    }
    issues = run(doc)
    assert issues == []


def test_two_ball_dribble_where_balls_are_held_by_different_players_is_flagged_per_ball():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}, {"type": "offense", "nr": 2, "x": 1, "y": 5}],
        "balls": [{"id": "ball_1", "carried_by": "offense_1"}, {"id": "ball_2", "carried_by": "offense_2"}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "dribble", "ball_ids": ["ball_1", "ball_2"],
             "moves": [{"to": {"x": 1, "y": 1}}]},
        ],
    }
    issues = run(doc)
    mismatch = next((i for i in issues if i.code == "BALL_CARRIER_MISMATCH" and i.path == "/actions/0"), None)
    assert mismatch is not None
    assert mismatch.data.get("ball_id") == "ball_2"
    # ball_1 (correctly held by offense_1) must not ALSO be flagged.
    assert len([i for i in issues if i.code == "BALL_CARRIER_MISMATCH"]) == 1
