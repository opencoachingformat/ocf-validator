import json

from ocf_validator import validate_text


def test_validate_text_parses_and_validates_a_v2_document():
    res = validate_text(json.dumps({
        "$schema": "https://opencoachingformat.org/schema/v2.json",
        "sport": "basketball",
        "meta": {"id": "00000000-0000-4000-8000-000000000001", "title": "t"},
        "court": {"court_profile": "fiba", "type": "half_court"},
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "balls": [{"id": "ball_1", "carried_by": "offense_1"}],
        "actions": [{"id": "a1", "player": "offense_1", "type": "shoot", "ball_id": "ball_1"}],
    }))
    assert res.valid is True


def test_validate_text_parses_and_validates_a_v1_document():
    res = validate_text(json.dumps({
        "$schema": "https://opencoachingformat.org/schema/v1.json",
        "meta": {"id": "00000000-0000-4000-8000-000000000001", "title": "t"},
        "court": {"ruleset": "fiba", "type": "half_court"},
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "balls": [{"id": "ball_1", "carried_by": "offense_1"}],
        "frames": [{
            "id": "f1",
            "actions": [{"player": "offense_1", "type": "shoot", "ball_id": "ball_1"}],
            "end_state": {"offense_1": {"x": 0, "y": 5}},
        }],
    }))
    assert res.valid is True


def test_validate_text_surfaces_malformed_json_as_json_parse_not_a_raised_error():
    res = validate_text("{ not json ")
    assert res.valid is False
    assert res.errors[0].code == "JSON_PARSE"


def test_validate_text_surfaces_a_json_array_as_json_parse_not_a_raised_type_error():
    res = validate_text("[1, 2, 3]")
    assert res.valid is False
    assert res.errors[0].code == "JSON_PARSE"


def test_validate_text_surfaces_a_json_primitive_as_json_parse_not_a_raised_type_error():
    res = validate_text("42")
    assert res.valid is False
    assert res.errors[0].code == "JSON_PARSE"


def test_validate_text_surfaces_null_as_json_parse_not_a_raised_type_error():
    res = validate_text("null")
    assert res.valid is False
    assert res.errors[0].code == "JSON_PARSE"
