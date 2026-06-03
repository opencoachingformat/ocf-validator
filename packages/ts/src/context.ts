import type { OcfDoc } from "./types.js";

export interface EntityInfo { type: string; nr?: number; }
export interface DocContext {
  entityRefs: Map<string, EntityInfo>;
  ballIds: Set<string>;
  frameIds: Set<string>;
  ruleset: string;
}

function entityRef(e: Record<string, unknown>): string | null {
  const type = e.type as string | undefined;
  if (!type) return null;
  if (type === "ball" || type === "coach") return type;
  if ("nr" in e) return `${type}_${e.nr}`;
  return type;
}

export function buildContext(doc: OcfDoc): DocContext {
  const entityRefs = new Map<string, EntityInfo>();
  for (const e of (((doc as { entities?: unknown[] }).entities ?? []) as Record<string, unknown>[])) {
    const ref = entityRef(e);
    if (ref) entityRefs.set(ref, { type: e.type as string, nr: e.nr as number | undefined });
  }
  const ballIds = new Set<string>();
  for (const b of (((doc as { balls?: unknown[] }).balls ?? []) as Record<string, unknown>[])) {
    if (typeof b.id === "string") ballIds.add(b.id);
  }
  const frameIds = new Set<string>();
  for (const f of (((doc as { frames?: unknown[] }).frames ?? []) as Record<string, unknown>[])) {
    if (typeof f.id === "string") frameIds.add(f.id);
  }
  const ruleset = ((doc as { court?: { ruleset?: string } }).court?.ruleset) ?? "custom";
  return { entityRefs, ballIds, frameIds, ruleset };
}
