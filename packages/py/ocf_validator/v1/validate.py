from ..codes import make_issue
from ..schema_level import schema_level
from ..schema_version import schema_check
from ..types import Issue, Result, assemble
from .context import build_context
from .possession import possession_by_frame
from .rules import (
    coherence_rules,
    possession_rules,
    quality_rules,
    reference_rules,
)


def validate(doc) -> Result:
    if not isinstance(doc, dict):
        raise TypeError("validate: expected a dict (parsed OCF document)")
    check = schema_check(doc)

    issues: list[Issue] = []
    # Document needs a newer minor than we bundle: warn, then best-effort validate.
    if check["outdated"]:
        issues.append(make_issue("VALIDATOR_MAYBE_OUTDATED", "/meta/min_schema_version", {
            "required": check["block"]["requiredByDoc"], "bundled": check["block"]["validatedAgainst"],
        }))

    level0 = schema_level(doc)
    if level0:
        return assemble(issues + level0, check["block"])
    ctx = build_context(doc)
    states = possession_by_frame(doc)
    issues.extend(reference_rules(doc, ctx))
    issues.extend(possession_rules(doc, ctx, states))
    issues.extend(coherence_rules(doc, ctx))
    issues.extend(quality_rules(doc, ctx))
    return assemble(issues, check["block"])
