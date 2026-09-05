import type { OcfDoc } from "../types.js";

export interface EntityInfo { type: string; nr?: number; }
export interface DocContextV2 {
  entityRefs: Map<string, EntityInfo>;
  ballIds: Set<string>;
  actionIds: Set<string>;
  ruleset: string;
}

function entityRef(e: Record<string, unknown>): string | null {
  const type = e.type as string | undefined;
  if (!type) return null;
  if (type === "ball" || type === "coach") return type;
  if ("nr" in e) return `${type}_${e.nr}`;
  return type;
}

/** A top-level actions[] item is a branch iff it has 'cases' (actions never do). */
export function isBranch(item: Record<string, unknown>): boolean {
  return "cases" in item;
}

/**
 * Visit every action AND branch in document order, recursing into every
 * branch case's own actions[] (which may itself contain nested branches).
 * Calls back with (item, jsonPointerPath) for both actions and branches.
 */
export function walkActions(
  items: Record<string, unknown>[],
  visit: (item: Record<string, unknown>, path: string) => void,
  basePath = "/actions",
): void {
  items.forEach((item, i) => {
    const path = `${basePath}/${i}`;
    visit(item, path);
    if (isBranch(item)) {
      const cases = (item.cases ?? {}) as Record<string, { actions?: unknown[] }>;
      for (const [outcome, branchCase] of Object.entries(cases)) {
        const nested = (branchCase.actions ?? []) as Record<string, unknown>[];
        walkActions(nested, visit, `${path}/cases/${outcome}/actions`);
      }
    }
  });
}

export function buildContextV2(doc: OcfDoc): DocContextV2 {
  const entityRefs = new Map<string, EntityInfo>();
  for (const e of (((doc as { entities?: unknown[] }).entities ?? []) as Record<string, unknown>[])) {
    const ref = entityRef(e);
    if (ref) entityRefs.set(ref, { type: e.type as string, nr: e.nr as number | undefined });
  }
  const ballIds = new Set<string>();
  for (const b of (((doc as { balls?: unknown[] }).balls ?? []) as Record<string, unknown>[])) {
    if (typeof b.id === "string") ballIds.add(b.id);
  }
  const actionIds = new Set<string>();
  const topLevel = (((doc as { actions?: unknown[] }).actions ?? []) as Record<string, unknown>[]);
  walkActions(topLevel, (item) => {
    if (typeof item.id === "string") actionIds.add(item.id);
  });
  const ruleset = ((doc as { court?: { ruleset?: string } }).court?.ruleset) ?? "custom";
  return { entityRefs, ballIds, actionIds, ruleset };
}
