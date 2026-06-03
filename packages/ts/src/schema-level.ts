import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import schema from "../../../shared/schema/ocf-action-v1.json" with { type: "json" };
import type { Issue, OcfDoc } from "./types.js";
import { makeIssue } from "./codes.js";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema as object);

function hasLegacyShape(doc: OcfDoc): boolean {
  const frames = (doc as { frames?: unknown }).frames;
  if (!Array.isArray(frames)) return false;
  return frames.some((f) =>
    f && typeof f === "object" && ("entity_states" in f || "lines" in f));
}

/** Non-empty result means STOP (do not run semantics). */
export function schemaLevel(doc: OcfDoc): Issue[] {
  if (hasLegacyShape(doc)) return [makeIssue("MODEL_LEGACY", "/frames", {})];
  if (validateSchema(doc)) return [];
  return (validateSchema.errors ?? []).map((e: ErrorObject) =>
    makeIssue("SCHEMA_INVALID", e.instancePath || "/", {
      detail: `${e.instancePath || "(root)"} ${e.message ?? ""}`.trim(),
    }));
}
