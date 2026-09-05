import type { Issue, Result, OcfDoc, SchemaBlock } from "../types.js";
import { assemble } from "../types.js";
import { schemaLevelV2 } from "./schema-level.js";
import { buildContextV2 } from "./context.js";
import { referenceRulesV2 } from "./rules/references.js";
import { possessionRulesV2 } from "./rules/possession.js";
import { branchRulesV2 } from "./rules/branch.js";
import { qualityRulesV2 } from "./rules/quality.js";
import { cmpSemver } from "../schema-version.js";
import { makeIssue } from "../codes.js";

// v2 covers reference/possession/branch rules, plus the two quality checks
// that don't depend on the frame model (ENTITY_OFFCOURT, CONTRAST_LOW — both
// read doc.entities/doc.color_scheme directly). Coherence rule equivalents
// (END_STATE_DISAGREE, START_STATE_DISCONTINUITY) and EMPTY_FRAME are NOT
// ported: they are frame/end_state-dependent and structurally inapplicable
// to v2 (no frames[], no start_state/end_state exist at all in this model).
export function validateV2(doc: OcfDoc, schemaBlock: SchemaBlock): Result {
  const issues: Issue[] = [];

  // Document needs a newer minor than we bundle: warn, then best-effort validate.
  // Mirrors v1/validate.ts's identical check (schemaBlock already carries the
  // comparison inputs, so recompute the boolean here rather than re-deriving
  // a whole second schemaCheck(doc)).
  if (schemaBlock.requiredByDoc !== null &&
      cmpSemver(schemaBlock.requiredByDoc, schemaBlock.validatedAgainst) > 0) {
    issues.push(makeIssue("VALIDATOR_MAYBE_OUTDATED", "/meta/min_schema_version", {
      required: schemaBlock.requiredByDoc, bundled: schemaBlock.validatedAgainst,
    }));
  }

  const level0 = schemaLevelV2(doc);
  if (level0.length > 0) return assemble([...issues, ...level0], schemaBlock); // stop on schema/legacy failure

  const ctx = buildContextV2(doc as Record<string, unknown>);
  issues.push(
    ...referenceRulesV2(doc as Record<string, unknown>, ctx),
    ...possessionRulesV2(doc as Record<string, unknown>, ctx),
    ...branchRulesV2(doc as Record<string, unknown>, ctx),
    ...qualityRulesV2(doc as Record<string, unknown>, ctx),
  );
  return assemble(issues, schemaBlock);
}
