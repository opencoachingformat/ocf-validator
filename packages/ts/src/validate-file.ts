import { readFileSync } from "node:fs";
import type { Result, OcfDoc } from "./types.js";
import { makeIssue } from "./codes.js";
import { assemble, validate } from "./validate.js";
import { bundledSchemaInfo } from "./schema-version.js";

export function validateFile(path: string): Result {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    // Parse failed before any schema check ran: report against the bundled version.
    return assemble([makeIssue("JSON_PARSE", "/", { detail: (err as Error).message })], {
      validatedAgainst: bundledSchemaInfo.version,
      documentDeclared: null,
      requiredByDoc: null,
      match: false,
    });
  }
  return validate(parsed as OcfDoc);
}
