from dataclasses import dataclass, field
from typing import Any, Literal

Severity = Literal["error", "warning"]


@dataclass
class Issue:
    code: str
    severity: Severity
    message: str
    path: str
    frame: str | None = None
    spec_ref: str | None = None
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class Result:
    valid: bool
    errors: list[Issue]
    warnings: list[Issue]
    summary: dict[str, int]
    schema: dict[str, Any] | None = None


def assemble(issues: list[Issue], schema_block: dict | None = None) -> Result:
    """Partitions issues into errors/warnings and computes the summary/valid
    flag. Shared by both v1 and v2 validate()."""
    errors = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]
    return Result(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        summary={"errors": len(errors), "warnings": len(warnings)},
        schema=schema_block,
    )
