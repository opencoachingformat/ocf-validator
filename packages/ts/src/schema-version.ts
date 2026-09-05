import schemaV1 from "../../../shared/schema/ocf-action-v1.json" with { type: "json" };
import schemaV2 from "../../../shared/schema/ocf-action-v2.json" with { type: "json" };
import type { OcfDoc } from "./types.js";

const CANONICAL_ID_V1 = "https://opencoachingformat.org/schema/v1.json";
const CANONICAL_ID_V2 = "https://opencoachingformat.org/schema/v2.json";

export interface SchemaInfo { version: string; major: string; id: string; }

function infoFrom(schema: unknown, canonicalId: string): SchemaInfo {
  const rawVersion = (schema as Record<string, unknown>)["x-ocf-version"];
  const version = typeof rawVersion === "string" ? rawVersion : "0.0.0";
  return {
    version,
    major: "v" + version.split(".")[0],
    id: ((schema as Record<string, unknown>)["$id"] as string) ?? canonicalId,
  };
}

const BUNDLED: Record<"v1" | "v2", SchemaInfo> = {
  v1: infoFrom(schemaV1, CANONICAL_ID_V1),
  v2: infoFrom(schemaV2, CANONICAL_ID_V2),
};

/** Back-compat: existing v1-only call sites keep working unchanged. */
export const bundledSchemaInfo: SchemaInfo = BUNDLED.v1;

export function bundledSchemaInfoFor(major: "v1" | "v2"): SchemaInfo {
  return BUNDLED[major];
}

export function parseMajor(schemaUrl: string | undefined): string | null {
  if (typeof schemaUrl !== "string") return null;
  const m = schemaUrl.match(/\/schema\/(v\d+)\.json/);
  return m ? m[1] : null;
}

export function cmpSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10));
  const pb = b.split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

export interface SchemaBlock {
  validatedAgainst: string;
  documentDeclared: string | null;
  requiredByDoc: string | null;
  match: boolean;
}

export interface SchemaCheck {
  majorUnsupported: boolean;
  declaredMajor: string | null;
  outdated: boolean;
  block: SchemaBlock;
}

const SUPPORTED_MAJORS = new Set(["v1", "v2"]);

// Pure, synchronous. Dispatches to the matching bundled version's info based
// on the document's declared major; falls back to v2 (the current default)
// when $schema is absent, matching how v1 defaulted to itself when absent.
export function schemaCheck(doc: OcfDoc, validatedAgainstOverride?: string): SchemaCheck {
  const declared = (doc as { $schema?: string }).$schema ?? null;
  const declaredMajor = parseMajor(declared ?? undefined);
  const effectiveMajor = (declaredMajor && SUPPORTED_MAJORS.has(declaredMajor) ? declaredMajor : "v2") as "v1" | "v2";
  const majorUnsupported = declaredMajor !== null && !SUPPORTED_MAJORS.has(declaredMajor);

  const bundled = BUNDLED[effectiveMajor];
  const validatedAgainst = validatedAgainstOverride ?? bundled.version;

  const meta = (doc as { meta?: { min_schema_version?: string } }).meta;
  const requiredByDoc = typeof meta?.min_schema_version === "string" ? meta.min_schema_version : null;
  const outdated = requiredByDoc !== null && cmpSemver(requiredByDoc, validatedAgainst) > 0;

  const match = !majorUnsupported && !outdated;
  return {
    majorUnsupported, declaredMajor, outdated,
    block: { validatedAgainst, documentDeclared: declared, requiredByDoc, match },
  };
}

export function effectiveMajorOf(doc: OcfDoc): "v1" | "v2" {
  const declared = (doc as { $schema?: string }).$schema ?? null;
  const declaredMajor = parseMajor(declared ?? undefined);
  return (declaredMajor && SUPPORTED_MAJORS.has(declaredMajor) ? declaredMajor : "v2") as "v1" | "v2";
}
