import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
VALID = ROOT / "shared" / "conformance" / "valid" / "pick-and-roll.ocf.json"
INVALID = ROOT / "shared" / "conformance" / "invalid" / "sem-pass-non-carrier.json"


def _run(args):
    return subprocess.run(
        [sys.executable, "-m", "ocf_validator.cli", *args],
        capture_output=True, text=True, cwd=ROOT / "packages" / "py")


def test_exit_zero_on_valid():
    assert _run([str(VALID)]).returncode == 0


def test_exit_one_on_invalid():
    assert _run([str(INVALID)]).returncode == 1


def test_json_flag_parses_and_omits_absent_optional_fields():
    r = _run(["--json", str(VALID)])
    assert r.returncode == 0
    parsed = json.loads(r.stdout)
    # valid example -> no errors; structure present
    key = next(iter(parsed))
    assert parsed[key]["valid"] is True
    assert parsed[key]["errors"] == []


def test_usage_error_no_files_is_exit_2():
    assert _run([]).returncode == 2
