import json
from pathlib import Path

import pytest

from ocf_validator import validate_file

SHARED_ROOT = Path(__file__).resolve().parents[3] / "shared" / "conformance"
VERSIONS = ("v1", "v2")


def _load_cases(version: str) -> dict:
    return json.loads((SHARED_ROOT / version / "cases.json").read_text())


CASES = {version: _load_cases(version) for version in VERSIONS}


@pytest.mark.parametrize(
    "version,c",
    [(v, c) for v in VERSIONS for c in CASES[v]["valid"]],
    ids=[f"{v}/{c['file']}" for v in VERSIONS for c in CASES[v]["valid"]],
)
def test_valid(version, c):
    res = validate_file(str(SHARED_ROOT / version / c["file"]))
    assert res.errors == [], [e.code for e in res.errors]
    assert res.valid


@pytest.mark.parametrize(
    "version,c",
    [(v, c) for v in VERSIONS for c in CASES[v]["invalid"]],
    ids=[f"{v}/{c['file']}" for v in VERSIONS for c in CASES[v]["invalid"]],
)
def test_invalid(version, c):
    res = validate_file(str(SHARED_ROOT / version / c["file"]))
    assert not res.valid
    got = {e.code for e in res.errors}
    for code in c["codes"]:
        assert code in got
    for w in c.get("warnings", []):
        assert w in {x.code for x in res.warnings}


@pytest.mark.parametrize(
    "version,c",
    [(v, c) for v in VERSIONS for c in CASES[v].get("warn", [])],
    ids=[f"{v}/{c['file']}" for v in VERSIONS for c in CASES[v].get("warn", [])],
)
def test_warn(version, c):
    res = validate_file(str(SHARED_ROOT / version / c["file"]))
    assert res.valid
    gotw = {w.code for w in res.warnings}
    for w in c["warnings"]:
        assert w in gotw
