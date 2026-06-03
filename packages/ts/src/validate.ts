import type { Issue, Result, OcfDoc } from "./types.js";
import { schemaLevel } from "./schema-level.js";

export function assemble(issues: Issue[]): Result {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: { errors: errors.length, warnings: warnings.length },
  };
}

export function validate(doc: OcfDoc): Result {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new TypeError("validate: expected an object (parsed OCF document)");
  }
  const issues: Issue[] = [];
  const level0 = schemaLevel(doc);
  if (level0.length > 0) return assemble(level0); // stop on schema/legacy failure
  // Level 1 (semantics) appended in later tasks.
  return assemble(issues);
}
