import type { Issue, Result, OcfDoc, SchemaBlock } from "../types.js";
import { buildContextV2 } from "./context.js";
import { referenceRulesV2 } from "./rules/references.js";
import { possessionRulesV2 } from "./rules/possession.js";
import { branchRulesV2 } from "./rules/branch.js";

export function assembleV2(issues: Issue[], schema: SchemaBlock): Result {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: { errors: errors.length, warnings: warnings.length },
    schema,
  };
}

export function validateV2(doc: OcfDoc, schemaBlock: SchemaBlock): Result {
  const ctx = buildContextV2(doc as Record<string, unknown>);
  const issues: Issue[] = [
    ...referenceRulesV2(doc as Record<string, unknown>, ctx),
    ...possessionRulesV2(doc as Record<string, unknown>, ctx),
    ...branchRulesV2(doc as Record<string, unknown>, ctx),
  ];
  return assembleV2(issues, schemaBlock);
}
