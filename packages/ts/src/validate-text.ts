import type { Result, OcfDoc } from "./types.js";
import { assemble } from "./types.js";
import { makeIssue } from "./codes.js";
import { validate } from "./validate.js";
import { bundledSchemaInfo } from "./schema-version.js";

/**
 * Same JSON.parse-then-validate pattern as validateFile, for callers that
 * hold the document as a string rather than a filesystem path (e.g. a
 * browser text editor). Parse failures and non-object input are reported as
 * a normal Result (JSON_PARSE), never thrown — validate() itself throws a
 * TypeError for non-object input, since it assumes its caller already
 * parsed valid JSON; this is the boundary that turns raw text into that
 * guarantee.
 */
export function validateText(text: string): Result {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return assemble([makeIssue("JSON_PARSE", "/", { detail: (err as Error).message })], {
      validatedAgainst: bundledSchemaInfo.version,
      documentDeclared: null,
      requiredByDoc: null,
      match: false,
    });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return assemble([makeIssue("JSON_PARSE", "/", { detail: "Document must be a JSON object." })], {
      validatedAgainst: bundledSchemaInfo.version,
      documentDeclared: null,
      requiredByDoc: null,
      match: false,
    });
  }
  return validate(parsed as OcfDoc);
}
