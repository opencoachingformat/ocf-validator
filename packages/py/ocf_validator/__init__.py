import json

from .codes import make_issue
from .schema_version import BUNDLED_MAJOR, effective_major_of, schema_check
from .types import Issue, Result, assemble
from .v1.validate import validate as validate_v1
from .v2.validate import validate_v2

__all__ = ["validate", "validate_file", "validate_text", "Issue", "Result"]


def validate(doc) -> Result:
    """Top-level entry point: dispatches to the v1 or v2 semantic rule set
    based on the document's declared (or defaulted) schema major. This is the
    ONLY place that decides which rule set runs — v1.validate.validate and
    v2.validate.validate_v2 each assume they are only ever called for a
    document of their own major.
    """
    if not isinstance(doc, dict):
        raise TypeError("validate: expected a dict (parsed OCF document)")
    check = schema_check(doc)

    # Unsupported major: refuse cleanly, do not run either rule set.
    if check["major_unsupported"]:
        return assemble([
            make_issue("SCHEMA_MAJOR_UNSUPPORTED", "/$schema", {
                "declared": check["declared_major"], "supported": BUNDLED_MAJOR,
            }),
        ], check["block"])

    major = effective_major_of(doc)
    return validate_v1(doc) if major == "v1" else validate_v2(doc, check["block"])


def validate_file(path: str) -> Result:
    try:
        with open(path, encoding="utf-8") as fh:
            doc = json.loads(fh.read())
    except (json.JSONDecodeError, OSError) as err:
        return assemble([make_issue("JSON_PARSE", "/", {"detail": str(err)})])
    return validate(doc)


def validate_text(text: str) -> Result:
    """Same JSON-parse-then-validate pattern as validate_file, for callers
    that hold the document as a string rather than a filesystem path (e.g. a
    browser/UI text editor via the WASM or Pyodide build). Parse failures and
    non-object input are reported as a normal Result (JSON_PARSE), never
    raised — validate() itself raises TypeError for non-dict input, since it
    assumes its caller already parsed valid JSON; this is the boundary that
    turns raw text into that guarantee.
    """
    try:
        doc = json.loads(text)
    except json.JSONDecodeError as err:
        return assemble([make_issue("JSON_PARSE", "/", {"detail": str(err)})])
    if not isinstance(doc, dict):
        return assemble([make_issue("JSON_PARSE", "/", {"detail": "Document must be a JSON object."})])
    return validate(doc)
