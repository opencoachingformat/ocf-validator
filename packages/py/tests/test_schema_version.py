from ocf_validator import validate
from ocf_validator.schema_version import bundled_schema_info_for, cmp_semver

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
    doc = {**BASE, "$schema": "https://opencoachingformat.org/schema/v3.json"}
    res = validate(doc)
    assert res.valid is False
    assert any(e.code == "SCHEMA_MAJOR_UNSUPPORTED" for e in res.errors)
    assert not any(e.code == "SCHEMA_INVALID" for e in res.errors)


def test_newer_minor_warns_but_validates():
    doc = {**BASE, "meta": {**BASE["meta"], "min_schema_version": "9.9.9"}}
    res = validate(doc)
    assert any(w.code == "VALIDATOR_MAYBE_OUTDATED" for w in res.warnings)
    assert res.schema["requiredByDoc"] == "9.9.9"


def test_bundled_schema_info_for_v2_reports_major_v2():
    info = bundled_schema_info_for("v2")
    assert info["major"] == "v2"
    assert info["id"] == "https://opencoachingformat.org/schema/v2.json"


def test_bundled_schema_info_for_v1_unchanged():
    info = bundled_schema_info_for("v1")
    assert info["major"] == "v1"


def test_cmp_semver_normal_versions():
    assert cmp_semver("1.2.3", "1.2.3") == 0
    assert cmp_semver("2.0.0", "1.9.9") > 0
    assert cmp_semver("1.2.3", "1.2.4") < 0


def test_cmp_semver_tolerates_prerelease_suffix_on_either_side():
    # Regression test for a real crash: cmp_semver used to raise ValueError on
    # a prerelease-suffixed segment like "0-alpha" (int("0-alpha") fails).
    # The v2 bundled schema's own x-ocf-version ("2.0.0-alpha.1") triggers
    # this on every validated document until fixed.
    assert cmp_semver("2.0.0-alpha.1", "2.0.0-alpha.1") == 0
    assert cmp_semver("2.0.0-alpha.1", "1.9.9") > 0
    assert cmp_semver("1.9.9", "2.0.0-alpha.1") < 0
    # A non-numeric-leading segment (no digits at all) is tolerated as 0,
    # matching JS's parseInt("alpha", 10) -> NaN -> treated as 0 upstream.
    assert cmp_semver("1.2.alpha", "1.2.0") == 0
