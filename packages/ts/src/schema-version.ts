import schema from "../../../shared/schema/ocf-action-v1.json" with { type: "json" };
import type { OcfDoc } from "./types.js";

const CANONICAL_ID = "https://opencoachingformat.org/schema/v1.json";

export interface SchemaInfo { version: string; major: string; id: string; }

const rawVersion = (schema as Record<string, unknown>)["x-ocf-version"];
export const bundledSchemaInfo: SchemaInfo = {
  version: typeof rawVersion === "string" ? rawVersion : "0.0.0",
  major: "v" + (typeof rawVersion === "string" ? rawVersion.split(".")[0] : "0"),
  id: ((schema as Record<string, unknown>)["$id"] as string) ?? CANONICAL_ID,
};

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

// Pure, synchronous. validatedAgainst defaults to the bundled version; the async
// fetch path (validateAsync) may raise it after loading a newer schema.
export function schemaCheck(doc: OcfDoc, validatedAgainst = bundledSchemaInfo.version): SchemaCheck {
  const declared = (doc as { $schema?: string }).$schema ?? null;
  const declaredMajor = parseMajor(declared ?? undefined);
  const majorUnsupported = declaredMajor !== null && declaredMajor !== bundledSchemaInfo.major;

  const meta = (doc as { meta?: { min_schema_version?: string } }).meta;
  const requiredByDoc = typeof meta?.min_schema_version === "string" ? meta.min_schema_version : null;
  const outdated = requiredByDoc !== null && cmpSemver(requiredByDoc, validatedAgainst) > 0;

  const match = !majorUnsupported && !outdated;
  return {
    majorUnsupported, declaredMajor, outdated,
    block: { validatedAgainst, documentDeclared: declared, requiredByDoc, match },
  };
}
