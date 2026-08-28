import json

from .codes import make_issue
from .context import build_context
from .possession import possession_by_frame
from .rules import (
    coherence_rules,
    possession_rules,
    quality_rules,
    reference_rules,
)
from .schema_level import schema_level
from .schema_version import BUNDLED_MAJOR, schema_check
from .types import Issue, Result


def _assemble(issues: list[Issue], schema_block: dict | None = None) -> Result:
    errors = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]
    return Result(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        summary={"errors": len(errors), "warnings": len(warnings)},
        schema=schema_block,
    )


def validate(doc) -> Result:
    if not isinstance(doc, dict):
        raise TypeError("validate: expected a dict (parsed OCF document)")
    check = schema_check(doc)

    # Different major: refuse cleanly, do not run v1 schema/semantics.
    if check["major_unsupported"]:
        return _assemble([
            make_issue("SCHEMA_MAJOR_UNSUPPORTED", "/$schema", {
                "declared": check["declared_major"], "supported": BUNDLED_MAJOR,
            }),
        ], check["block"])

    issues: list[Issue] = []
    # Document needs a newer minor than we bundle: warn, then best-effort validate.
    if check["outdated"]:
        issues.append(make_issue("VALIDATOR_MAYBE_OUTDATED", "/meta/min_schema_version", {
            "required": check["block"]["requiredByDoc"], "bundled": check["block"]["validatedAgainst"],
        }))

    level0 = schema_level(doc)
    if level0:
        return _assemble(issues + level0, check["block"])
    ctx = build_context(doc)
    states = possession_by_frame(doc)
    issues.extend(reference_rules(doc, ctx))
    issues.extend(possession_rules(doc, ctx, states))
    issues.extend(coherence_rules(doc, ctx))
    issues.extend(quality_rules(doc, ctx))
    return _assemble(issues, check["block"])


def validate_file(path: str) -> Result:
    try:
        with open(path, encoding="utf-8") as fh:
            doc = json.loads(fh.read())
    except (json.JSONDecodeError, OSError) as err:
        return _assemble([make_issue("JSON_PARSE", "/", {"detail": str(err)})])
    return validate(doc)
