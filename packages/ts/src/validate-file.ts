import { readFileSync } from "node:fs";
import type { Result, OcfDoc } from "./types.js";
import { makeIssue } from "./codes.js";
import { assemble, validate } from "./validate.js";

export function validateFile(path: string): Result {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return assemble([makeIssue("JSON_PARSE", "/", { detail: (err as Error).message })]);
  }
  return validate(parsed as OcfDoc);
}
