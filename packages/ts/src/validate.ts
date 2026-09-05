import type { Result, OcfDoc } from "./types.js";
import { assemble, validate as validateV1 } from "./v1/validate.js";
import { validateV2 } from "./v2/validate.js";
import { schemaCheck, bundledSchemaInfo, effectiveMajorOf } from "./schema-version.js";
import { makeIssue } from "./codes.js";

/**
 * Top-level entry point: dispatches to the v1 or v2 semantic rule set based on
 * the document's declared (or defaulted) schema major. This is the ONLY place
 * that decides which rule set runs — v1/validate.ts and v2/validate.ts each
 * assume they are only ever called for a document of their own major.
 */
export function validate(doc: OcfDoc): Result {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new TypeError("validate: expected an object (parsed OCF document)");
  }
  const check = schemaCheck(doc);

  // Unsupported major: refuse cleanly, do not run either rule set.
  if (check.majorUnsupported) {
    return assemble([
      makeIssue("SCHEMA_MAJOR_UNSUPPORTED", "/$schema", {
        declared: check.declaredMajor, supported: bundledSchemaInfo.major,
      }),
    ], check.block);
  }

  const major = effectiveMajorOf(doc);
  return major === "v1" ? validateV1(doc) : validateV2(doc, check.block);
}
