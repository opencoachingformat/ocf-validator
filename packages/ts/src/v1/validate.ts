import type { Issue, Result, OcfDoc } from "../types.js";
import { assemble } from "../types.js";
import { schemaLevel } from "../schema-level.js";
import { buildContext } from "./context.js";
import { possessionByFrame } from "./possession.js";
import { referenceRules } from "./rules/references.js";
import { possessionRules } from "./rules/possession-rules.js";
import { coherenceRules } from "./rules/coherence.js";
import { qualityRules } from "./rules/quality.js";
import { schemaCheck } from "../schema-version.js";
import { makeIssue } from "../codes.js";

export function validate(doc: OcfDoc): Result {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new TypeError("validate: expected an object (parsed OCF document)");
  }
  const check = schemaCheck(doc);

  const issues: Issue[] = [];
  // Document needs a newer minor than we bundle: warn, then best-effort validate.
  if (check.outdated) {
    issues.push(makeIssue("VALIDATOR_MAYBE_OUTDATED", "/meta/min_schema_version", {
      required: check.block.requiredByDoc, bundled: check.block.validatedAgainst,
    }));
  }

  const level0 = schemaLevel(doc);
  if (level0.length > 0) return assemble([...issues, ...level0], check.block); // stop on schema/legacy failure

  const ctx = buildContext(doc);
  const states = possessionByFrame(doc);
  issues.push(
    ...referenceRules(doc, ctx),
    ...possessionRules(doc, ctx, states),
    ...coherenceRules(doc, ctx),
    ...qualityRules(doc, ctx),
  );
  return assemble(issues, check.block);
}
