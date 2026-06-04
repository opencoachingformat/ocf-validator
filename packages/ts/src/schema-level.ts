import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import schema from "../../../shared/schema/ocf-action-v1.json" with { type: "json" };
import type { Issue, OcfDoc } from "./types.js";
import { makeIssue } from "./codes.js";

// The canonical schema trips two AJV strict-mode checks:
//  - strictRequired: an if/then block references custom_dimensions as required
//    inside "then" without declaring it in the surrounding properties.
//  - strictSchema: the "uri" format is referenced; ajv-formats supplies it but
//    strict schema analysis flags it. strictTypes stays enabled.
// The Python (jsonschema) mirror must make equivalent allowances.
const ajv = new Ajv({ allErrors: true, strictSchema: false, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema as object);

function hasLegacyShape(doc: OcfDoc): boolean {
  const frames = (doc as { frames?: unknown }).frames;
  if (!Array.isArray(frames)) return false;
  // entity_states is the unambiguous sentinel of the superseded geometric model
  // (it never appears in the v1 action schema). We deliberately do NOT trigger on
  // `lines` alone, which is a generic word a v1 author could add by mistake — such
  // a doc should get a precise SCHEMA_INVALID, not a misleading MODEL_LEGACY.
  return frames.some((f) =>
    f !== null && typeof f === "object" && "entity_states" in f);
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
