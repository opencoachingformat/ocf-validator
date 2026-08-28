import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { OcfDoc, Result } from "./types.js";
import { validate } from "./validate.js";
import { schemaCheck, bundledSchemaInfo } from "./schema-version.js";
import { makeIssue } from "./codes.js";

export interface AsyncOptions {
  fetchLatestSchema?: boolean;
  fetchImpl?: typeof fetch;
}

// Validate a doc, and — only when it declares a newer min_schema_version than
// bundled — try once to fetch the current schema and validate against it. On any
// failure, fall back to the synchronous validate() (which emits the outdated
// warning). This never changes conformance semantics; it is a browser aid.
export async function validateAsync(doc: OcfDoc, opts: AsyncOptions = {}): Promise<Result> {
  const { fetchLatestSchema = true, fetchImpl } = opts;
  const pre = schemaCheck(doc);

  // Only the newer-minor case benefits from a fetch. Everything else is sync.
  if (!fetchLatestSchema || pre.majorUnsupported || !pre.outdated) {
    return validate(doc);
  }

  const declared = (doc as { $schema?: string }).$schema;
  const url = declared ?? bundledSchemaInfo.id;
  const doFetch = fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!doFetch) return validate(doc);

  try {
    const resp = await doFetch(url);
    if (!resp.ok) return validate(doc);
    const fetched = (await resp.json()) as Record<string, unknown>;
    const fetchedVersion = typeof fetched["x-ocf-version"] === "string"
      ? (fetched["x-ocf-version"] as string) : bundledSchemaInfo.version;

    const ajv = new Ajv({ allErrors: true, strictSchema: false, strictRequired: false });
    addFormats(ajv);
    const validateFetched = ajv.compile(fetched);
    const check = schemaCheck(doc, fetchedVersion);

    if (validateFetched(doc)) {
      // Schema-clean against the newer schema: run the sync validator for
      // semantics, then drop the now-inapplicable outdated warning and swap in
      // the schema block that records the newer validatedAgainst version.
      const res = validate(doc);
      const warnings = res.warnings.filter((w) => w.code !== "VALIDATOR_MAYBE_OUTDATED");
      return {
        ...res,
        warnings,
        summary: { errors: res.errors.length, warnings: warnings.length },
        schema: check.block,
      };
    }

    // Newer schema rejected it: surface those schema errors, noting the newer version.
    const errors = (validateFetched.errors ?? []).map((e) =>
      makeIssue("SCHEMA_INVALID", e.instancePath || "/", {
        detail: `${e.instancePath || "(root)"} ${e.message ?? ""}`.trim(),
      }));
    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      summary: { errors: errors.length, warnings: 0 },
      schema: check.block,
    };
  } catch {
    return validate(doc);
  }
}
