import json

from .codes import make_issue
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
    issues: list[Issue] = []
    # Level 1 rules appended in Task 17.
    return _assemble(issues)


def validate_file(path: str) -> Result:
    try:
        with open(path, encoding="utf-8") as fh:
            doc = json.loads(fh.read())
    except (json.JSONDecodeError, OSError) as err:
        return _assemble([make_issue("JSON_PARSE", "/", {"detail": str(err)})])
    return validate(doc)
