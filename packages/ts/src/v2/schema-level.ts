import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import schema from "../../../../shared/schema/ocf-action-v2.json" with { type: "json" };
import type { Issue, OcfDoc } from "../types.js";
import { makeIssue } from "../codes.js";

// Same AJV strict-mode allowances as v1/schema-level.ts (see its comment) —
// the v2 schema shares the same if/then and "uri" format shapes.
const ajv = new Ajv({ allErrors: true, strictSchema: false, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema as object);

function hasLegacyShape(doc: OcfDoc): boolean {
  const frames = (doc as { frames?: unknown }).frames;
  if (!Array.isArray(frames)) return false;
  // Same structural sentinel as v1 (entity_states inside a frames[] member):
  // purely shape-based, independent of which schema major the document
  // declares. A v2 document should never have `frames` at all (v2's schema
  // has no such property and additionalProperties:false), so a doc shaped
  // like this is unambiguously the pre-v1.0.0 legacy geometric model, not a
  // v2-specific concept — this check is identical to v1's.
  return frames.some((f) =>
    f !== null && typeof f === "object" && "entity_states" in f);
}

/** Non-empty result means STOP (do not run v2 semantic rule sets). */
export function schemaLevelV2(doc: OcfDoc): Issue[] {
  if (hasLegacyShape(doc)) return [makeIssue("MODEL_LEGACY", "/frames", {})];
  if (validateSchema(doc)) return [];
  return (validateSchema.errors ?? []).map((e: ErrorObject) =>
    makeIssue("SCHEMA_INVALID", e.instancePath || "/", {
      detail: `${e.instancePath || "(root)"} ${e.message ?? ""}`.trim(),
    }));
}
