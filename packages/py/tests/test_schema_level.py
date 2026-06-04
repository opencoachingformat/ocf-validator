from ocf_validator import validate

BASE = {
    "$schema": "x",
    "meta": {"id": "00000000-0000-4000-8000-000000000001", "title": "t"},
    "court": {"ruleset": "fiba", "type": "half_court"},
    "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
    "frames": [{"id": "f1", "actions": [], "end_state": {}}],
}


def test_minimal_valid_passes_level0():
    assert validate(BASE).valid


def test_missing_required_is_schema_invalid():
    bad = {**BASE, "frames": [{"id": "f1"}]}
    res = validate(bad)
    assert not res.valid
    assert any(e.code == "SCHEMA_INVALID" for e in res.errors)


def test_legacy_model_rejected():
    legacy = {**BASE, "frames": [{"id": "f1", "entity_states": {}, "lines": []}]}
    res = validate(legacy)
    assert res.errors[0].code == "MODEL_LEGACY"
