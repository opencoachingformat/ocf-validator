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
from .types import Issue, Result


def _assemble(issues: list[Issue]) -> Result:
    errors = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]
    return Result(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        summary={"errors": len(errors), "warnings": len(warnings)},
    )


def validate(doc) -> Result:
    if not isinstance(doc, dict):
        raise TypeError("validate: expected a dict (parsed OCF document)")
    level0 = schema_level(doc)
    if level0:
        return _assemble(level0)
    ctx = build_context(doc)
    states = possession_by_frame(doc)
    issues: list[Issue] = []
    issues.extend(reference_rules(doc, ctx))
    issues.extend(possession_rules(doc, ctx, states))
    issues.extend(coherence_rules(doc, ctx))
    issues.extend(quality_rules(doc, ctx))
    return _assemble(issues)


def validate_file(path: str) -> Result:
    try:
        with open(path, encoding="utf-8") as fh:
            doc = json.loads(fh.read())
    except (json.JSONDecodeError, OSError) as err:
        return _assemble([make_issue("JSON_PARSE", "/", {"detail": str(err)})])
    return validate(doc)
