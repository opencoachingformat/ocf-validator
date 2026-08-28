import json
import re
from pathlib import Path

_SCHEMA = json.loads(
    (
        Path(__file__).resolve().parents[3]
        / "shared"
        / "schema"
        / "ocf-action-v1.json"
    ).read_text()
)
_CANONICAL_ID = "https://opencoachingformat.org/schema/v1.json"

_raw_version = _SCHEMA.get("x-ocf-version")
BUNDLED_VERSION = _raw_version if isinstance(_raw_version, str) else "0.0.0"
BUNDLED_MAJOR = "v" + (BUNDLED_VERSION.split(".")[0] if isinstance(_raw_version, str) else "0")
BUNDLED_ID = _SCHEMA.get("$id", _CANONICAL_ID)


def parse_major(schema_url):
    if not isinstance(schema_url, str):
        return None
    m = re.search(r"/schema/(v\d+)\.json", schema_url)
    return m.group(1) if m else None


def cmp_semver(a, b):
    pa = [int(x) for x in a.split(".")]
    pb = [int(x) for x in b.split(".")]
    for i in range(3):
        d = (pa[i] if i < len(pa) else 0) - (pb[i] if i < len(pb) else 0)
        if d:
            return d
    return 0


def schema_check(doc, validated_against=None):
    validated_against = validated_against or BUNDLED_VERSION
    declared = doc.get("$schema")
    declared_major = parse_major(declared)
    major_unsupported = declared_major is not None and declared_major != BUNDLED_MAJOR

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
