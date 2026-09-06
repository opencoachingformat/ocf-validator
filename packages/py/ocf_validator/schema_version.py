import json
import re
from pathlib import Path

_SHARED_SCHEMA_DIR = Path(__file__).resolve().parents[3] / "shared" / "schema"

_CANONICAL_ID = {
    "v1": "https://opencoachingformat.org/schema/v1.json",
    "v2": "https://opencoachingformat.org/schema/v2.json",
}

_SCHEMA_FILE = {
    "v1": "ocf-action-v1.json",
    "v2": "ocf-action-v2.json",
}


def _load_info(major: str) -> dict:
    schema = json.loads((_SHARED_SCHEMA_DIR / _SCHEMA_FILE[major]).read_text())
    raw_version = schema.get("x-ocf-version")
    version = raw_version if isinstance(raw_version, str) else "0.0.0"
    return {
        "version": version,
        "major": "v" + version.split(".")[0],
        "id": schema.get("$id", _CANONICAL_ID[major]),
    }


_BUNDLED = {"v1": _load_info("v1"), "v2": _load_info("v2")}

# Back-compat: existing v1-only call sites keep working unchanged.
BUNDLED_VERSION = _BUNDLED["v1"]["version"]
BUNDLED_MAJOR = _BUNDLED["v1"]["major"]
BUNDLED_ID = _BUNDLED["v1"]["id"]

_SUPPORTED_MAJORS = {"v1", "v2"}


def bundled_schema_info_for(major: str) -> dict:
    return _BUNDLED[major]


def parse_major(schema_url):
    if not isinstance(schema_url, str):
        return None
    m = re.search(r"/schema/(v\d+)\.json", schema_url)
    return m.group(1) if m else None


def _lenient_int(segment: str) -> int:
    # Mirrors JS's `parseInt(segment, 10)`: parse the leading run of digits
    # and default to 0 otherwise. This tolerates a prerelease suffix on the
    # last segment (e.g. "0-alpha.1" in "2.0.0-alpha.1", the v2 schema's
    # in-development x-ocf-version) the same way the TS implementation does.
    m = re.match(r"-?\d+", segment)
    return int(m.group(0)) if m else 0


def cmp_semver(a, b):
    pa = [_lenient_int(x) for x in a.split(".")]
    pb = [_lenient_int(x) for x in b.split(".")]
    for i in range(3):
        d = (pa[i] if i < len(pa) else 0) - (pb[i] if i < len(pb) else 0)
        if d:
            return d
    return 0


def effective_major_of(doc: dict) -> str:
    declared = doc.get("$schema")
    declared_major = parse_major(declared)
    return declared_major if declared_major in _SUPPORTED_MAJORS else "v2"


def schema_check(doc, validated_against=None):
    declared = doc.get("$schema")
    declared_major = parse_major(declared)
    effective_major = declared_major if declared_major in _SUPPORTED_MAJORS else "v2"
    major_unsupported = declared_major is not None and declared_major not in _SUPPORTED_MAJORS

    bundled = _BUNDLED[effective_major]
    validated_against = validated_against or bundled["version"]

    meta = doc.get("meta") or {}
    required = meta.get("min_schema_version")
    required = required if isinstance(required, str) else None
    outdated = required is not None and cmp_semver(required, validated_against) > 0

    match = not major_unsupported and not outdated
    return {
        "major_unsupported": major_unsupported,
        "declared_major": declared_major,
        "outdated": outdated,
        "block": {
            "validatedAgainst": validated_against,
            "documentDeclared": declared,
            "requiredByDoc": required,
            "match": match,
        },
    }
