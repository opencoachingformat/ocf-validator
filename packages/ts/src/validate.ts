import { readFileSync } from "node:fs";
import type { Issue, Result, OcfDoc } from "./types.js";
import { schemaLevel } from "./schema-level.js";
import { makeIssue } from "./codes.js";
import { buildContext } from "./context.js";
import { possessionByFrame } from "./possession.js";
import { referenceRules } from "./rules/references.js";
import { possessionRules } from "./rules/possession-rules.js";
import { coherenceRules } from "./rules/coherence.js";
import { qualityRules } from "./rules/quality.js";

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

  const ctx = buildContext(doc);
  const states = possessionByFrame(doc);
  issues.push(
    ...referenceRules(doc, ctx),
    ...possessionRules(doc, ctx, states),
    ...coherenceRules(doc, ctx),
    ...qualityRules(doc, ctx),
  );
  return assemble(issues);
}

export function validateFile(path: string): Result {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return assemble([makeIssue("JSON_PARSE", "/", { detail: (err as Error).message })]);
  }
  return validate(parsed as OcfDoc);
}
