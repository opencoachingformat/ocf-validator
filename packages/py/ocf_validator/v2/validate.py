from ..codes import make_issue
from ..schema_version import cmp_semver
from ..types import Issue, Result, assemble
from .branch_rules import branch_rules_v2
from .context import build_context_v2
from .possession_rules import possession_rules_v2
from .quality_rules import quality_rules_v2
from .rules import reference_rules_v2
from .schema_level import schema_level_v2


# v2 covers reference/possession/branch rules, plus the two quality checks
# that don't depend on the frame model (ENTITY_OFFCOURT, CONTRAST_LOW — both
# read doc.entities/doc.color_scheme directly). Coherence rule equivalents
# (END_STATE_DISAGREE, START_STATE_DISCONTINUITY) and EMPTY_FRAME are NOT
# ported: they are frame/end_state-dependent and structurally inapplicable
# to v2 (no frames[], no start_state/end_state exist at all in this model).
def validate_v2(doc: dict, schema_block: dict) -> Result:
    issues: list[Issue] = []

    # Document needs a newer minor than we bundle: warn, then best-effort validate.
    # Mirrors v1/validate.py's identical check (schema_block already carries the
    # comparison inputs, so recompute the boolean here rather than re-deriving
    # a whole second schema_check(doc)).
    required_by_doc = schema_block.get("requiredByDoc")
    if required_by_doc is not None and cmp_semver(required_by_doc, schema_block["validatedAgainst"]) > 0:
        issues.append(
            make_issue(
                "VALIDATOR_MAYBE_OUTDATED",
                "/meta/min_schema_version",
                {"required": required_by_doc, "bundled": schema_block["validatedAgainst"]},
            )
        )

    level0 = schema_level_v2(doc)
    if level0:
        return assemble([*issues, *level0], schema_block)  # stop on schema/legacy failure

    ctx = build_context_v2(doc)
    issues.extend(reference_rules_v2(doc, ctx))
    issues.extend(possession_rules_v2(doc, ctx))
    issues.extend(branch_rules_v2(doc, ctx))
    issues.extend(quality_rules_v2(doc, ctx))
    return assemble(issues, schema_block)
