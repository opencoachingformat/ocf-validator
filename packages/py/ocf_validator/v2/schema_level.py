import json
from pathlib import Path

from jsonschema import Draft7Validator

from ..codes import make_issue
from ..types import Issue

_SCHEMA = json.loads(
    (
        Path(__file__).resolve().parents[4]
        / "shared"
        / "schema"
        / "ocf-action-v2.json"
    ).read_text()
)
_VALIDATOR = Draft7Validator(_SCHEMA)


def _has_legacy_shape(doc: dict) -> bool:
    frames = doc.get("frames")
    if not isinstance(frames, list):
        return False
    # Same structural sentinel as v1 (entity_states inside a frames[] member):
    # purely shape-based, independent of which schema major the document
    # declares. A v2 document should never have `frames` at all (v2's schema
    # has no such property and additionalProperties:false), so a doc shaped
    # like this is unambiguously the pre-v1.0.0 legacy geometric model, not a
    # v2-specific concept -- this check is identical to v1's.
    return any(isinstance(f, dict) and "entity_states" in f for f in frames)


def schema_level_v2(doc: dict) -> list[Issue]:
    if _has_legacy_shape(doc):
        return [make_issue("MODEL_LEGACY", "/frames", {})]
    issues: list[Issue] = []
    for e in sorted(_VALIDATOR.iter_errors(doc), key=lambda e: list(e.absolute_path)):
        ptr = "/" + "/".join(str(p) for p in e.absolute_path)
        issues.append(make_issue("SCHEMA_INVALID", ptr, {"detail": e.message}))
    return issues
