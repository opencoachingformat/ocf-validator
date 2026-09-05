import type { Issue, Result, OcfDoc, SchemaBlock } from "../types.js";
import { assemble } from "../types.js";
import { buildContextV2 } from "./context.js";
import { referenceRulesV2 } from "./rules/references.js";
import { possessionRulesV2 } from "./rules/possession.js";
import { branchRulesV2 } from "./rules/branch.js";

// v2 currently covers reference/possession/branch rules only. Quality and
// coherence rule equivalents (ported from v1/rules/{quality,coherence}.ts)
// are deferred — tracked as a follow-up task. This means v2 checks structural
// correctness but not the softer heuristic/style checks v1 documents get.
export function validateV2(doc: OcfDoc, schemaBlock: SchemaBlock): Result {
  const ctx = buildContextV2(doc as Record<string, unknown>);
  const issues: Issue[] = [
    ...referenceRulesV2(doc as Record<string, unknown>, ctx),
    ...possessionRulesV2(doc as Record<string, unknown>, ctx),
    ...branchRulesV2(doc as Record<string, unknown>, ctx),
  ];
  return assemble(issues, schemaBlock);
}
