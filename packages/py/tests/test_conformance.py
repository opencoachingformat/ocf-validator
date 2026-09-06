import json
from pathlib import Path

import pytest

from ocf_validator import validate_file

SHARED_ROOT = Path(__file__).resolve().parents[3] / "shared" / "conformance"
VERSIONS = ("v1", "v2")


def _load_cases(version: str) -> dict:
    return json.loads((SHARED_ROOT / version / "cases.json").read_text())


CASES = {version: _load_cases(version) for version in VERSIONS}


def _flatten(kind: str) -> list[tuple[str, dict]]:
    return [(v, c) for v in VERSIONS for c in CASES[v].get(kind, [])]


def _id(value) -> str | None:
    # Called once per individual parametrize value (i.e. once for `version`,
    # once for `c`), not once per (version, c) pair -- pytest then joins the
    # per-value ids with "-" into the final test id. Only `c` needs a custom
    # id (its filename); `version` alone (a plain string) already gets a
    # sensible default from pytest, so returning None there keeps it.
    return value["file"] if isinstance(value, dict) else None


@pytest.mark.parametrize("version,c", _flatten("valid"), ids=_id)
def test_valid(version, c):
    res = validate_file(str(SHARED_ROOT / version / c["file"]))
    assert res.errors == [], [e.code for e in res.errors]
    assert res.valid


@pytest.mark.parametrize("version,c", _flatten("invalid"), ids=_id)
def test_invalid(version, c):
    res = validate_file(str(SHARED_ROOT / version / c["file"]))
    assert not res.valid
    got = {e.code for e in res.errors}
    for code in c["codes"]:
        assert code in got
    for w in c.get("warnings", []):
        assert w in {x.code for x in res.warnings}


@pytest.mark.parametrize("version,c", _flatten("warn"), ids=_id)
def test_warn(version, c):
    res = validate_file(str(SHARED_ROOT / version / c["file"]))
    assert res.valid
    gotw = {w.code for w in res.warnings}
    for w in c["warnings"]:
        assert w in gotw
