from ..types import Issue, Result, assemble
from .branch_rules import branch_rules_v2
from .context import build_context_v2
from .possession_rules import possession_rules_v2
from .rules import reference_rules_v2


# v2 currently covers reference/possession/branch rules only. Quality and
# coherence rule equivalents (ported from v1/rules.py's quality_rules/
# coherence_rules) are deferred — tracked as a follow-up task. This means v2
# checks structural correctness but not the softer heuristic/style checks v1
# documents get.
def validate_v2(doc: dict, schema_block: dict) -> Result:
    ctx = build_context_v2(doc)
    issues: list[Issue] = []
    issues.extend(reference_rules_v2(doc, ctx))
    issues.extend(possession_rules_v2(doc, ctx))
    issues.extend(branch_rules_v2(doc, ctx))
    return assemble(issues, schema_block)
