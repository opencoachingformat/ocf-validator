import json
from pathlib import Path

import pytest

from ocf_validator import validate_file

ROOT = Path(__file__).resolve().parents[3] / "shared" / "conformance"
CASES = json.loads((ROOT / "cases.json").read_text())


@pytest.mark.parametrize("c", CASES["valid"], ids=lambda c: c["file"])
def test_valid(c):
    res = validate_file(str(ROOT / c["file"]))
    assert res.errors == [], [e.code for e in res.errors]
    assert res.valid


@pytest.mark.parametrize("c", CASES["invalid"], ids=lambda c: c["file"])
def test_invalid(c):
    res = validate_file(str(ROOT / c["file"]))
    assert not res.valid
    got = {e.code for e in res.errors}
    for code in c["codes"]:
        assert code in got
