import registry from "../../../shared/error-codes.json" with { type: "json" };
import type { Issue, Severity } from "./types.js";

interface CodeDef { severity: Severity; category: string; message: string; spec_ref?: string; }
export const CODES = registry as Record<string, CodeDef>;

function fill(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in data ? String(data[k]) : `{${k}}`);
}

export function makeIssue(
  code: string, path: string,
  data: Record<string, unknown> = {}, frame?: string,
): Issue {
  const def = CODES[code];
  if (!def) throw new Error(`Unknown error code: ${code}`);
  return {
    code, severity: def.severity, message: fill(def.message, data), path,
    ...(frame ? { frame } : {}),
    ...(def.spec_ref ? { spec_ref: def.spec_ref } : {}),
    ...(Object.keys(data).length ? { data } : {}),
  };
}
