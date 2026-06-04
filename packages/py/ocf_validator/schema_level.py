import json
from pathlib import Path

from jsonschema import Draft7Validator

from .codes import make_issue
from .types import Issue

_SCHEMA = json.loads(
    (
        Path(__file__).resolve().parents[3]
        / "shared"
        / "schema"
        / "ocf-action-v1.json"
    ).read_text()
)
_VALIDATOR = Draft7Validator(_SCHEMA)


def _has_legacy_shape(doc: dict) -> bool:
    frames = doc.get("frames")
    if not isinstance(frames, list):
        return False
    # entity_states is the unambiguous legacy sentinel (matches the TS impl).
    # A stray `lines` key is NOT treated as legacy — it becomes a schema error.
    return any(isinstance(f, dict) and "entity_states" in f for f in frames)


def schema_level(doc: dict) -> list[Issue]:
    if _has_legacy_shape(doc):
        return [make_issue("MODEL_LEGACY", "/frames", {})]
    issues: list[Issue] = []
    for e in sorted(_VALIDATOR.iter_errors(doc), key=lambda e: list(e.absolute_path)):
        ptr = "/" + "/".join(str(p) for p in e.absolute_path)
        issues.append(make_issue("SCHEMA_INVALID", ptr, {"detail": e.message}))
    return issues
