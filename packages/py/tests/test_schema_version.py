from ocf_validator.validate import validate

BASE = {
    "$schema": "https://opencoachingformat.org/schema/v1.json",
    "meta": {"id": "00000000-0000-4000-8000-000000000001", "title": "t"},
    "court": {"ruleset": "fiba", "type": "half_court"},
    "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
    "balls": [{"id": "ball_1", "carried_by": "offense_1"}],
    "frames": [{"id": "f1",
        "actions": [{"player": "offense_1", "type": "shoot", "ball_id": "ball_1"}],
        "end_state": {"offense_1": {"x": 0, "y": 5}}}],
}


def test_schema_block_present_and_matches():
    res = validate(BASE)
    assert res.schema is not None
    assert res.schema["documentDeclared"] == "https://opencoachingformat.org/schema/v1.json"
    assert res.schema["match"] is True


def test_different_major_rejected_without_cascade():
    doc = {**BASE, "$schema": "https://opencoachingformat.org/schema/v2.json"}
    res = validate(doc)
    assert res.valid is False
    assert any(e.code == "SCHEMA_MAJOR_UNSUPPORTED" for e in res.errors)
    assert not any(e.code == "SCHEMA_INVALID" for e in res.errors)


def test_newer_minor_warns_but_validates():
    doc = {**BASE, "meta": {**BASE["meta"], "min_schema_version": "9.9.9"}}
    res = validate(doc)
    assert any(w.code == "VALIDATOR_MAYBE_OUTDATED" for w in res.warnings)
    assert res.schema["requiredByDoc"] == "9.9.9"
