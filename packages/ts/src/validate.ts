import type { Issue, Result, OcfDoc } from "./types.js";

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
  // Level 0 (schema validation) — wired in Task 4.
  // Level 1 (semantic rules) — wired in Task 11.
  return assemble(issues);
}
