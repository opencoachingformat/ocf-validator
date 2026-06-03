import type { Issue, OcfDoc } from "../types.js";
import type { DocContext } from "../context.js";
import { getFrames } from "../context.js";
import { makeIssue } from "../codes.js";
import { halfExtent } from "../court-dimensions.js";

function relLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a: string, b: string): number | null {
  const la = relLuminance(a), lb = relLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function* coords(node: unknown): Generator<{ x: number; y: number }> {
  if (Array.isArray(node)) { for (const v of node) yield* coords(v); }
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.x === "number" && typeof o.y === "number") yield { x: o.x, y: o.y };
    for (const v of Object.values(o)) yield* coords(v);
  }
}

export function qualityRules(doc: OcfDoc, ctx: DocContext): Issue[] {
  const issues: Issue[] = [];

  const ext = halfExtent(ctx.ruleset);
  if (ext) {
    const entities = ((doc as { entities?: unknown[] }).entities ?? []);
    for (const c of coords(entities)) {
      if (Math.abs(c.x) > ext.x || Math.abs(c.y) > ext.y) {
        issues.push(makeIssue("ENTITY_OFFCOURT", "/entities",
          { x: c.x, y: c.y, ruleset: ctx.ruleset }));
        break;
      }
    }
  }

  const frames = getFrames(doc);
  frames.forEach((frame, fi) => {
    const actions = (frame.actions ?? []) as unknown[];
    const endState = (frame.end_state ?? {}) as Record<string, unknown>;
    if (actions.length === 0 && Object.keys(endState).length === 0) {
      issues.push(makeIssue("EMPTY_FRAME", `/frames/${fi}`, {}, frame.id as string));
    }
  });

  const cs = (doc as { color_scheme?: Record<string, string> }).color_scheme;
  if (cs && typeof cs.background === "string") {
    for (const [role, color] of Object.entries(cs)) {
      if (role === "background" || typeof color !== "string") continue;
      const ratio = contrast(color, cs.background);
      if (ratio !== null && ratio < 4.5) {
        issues.push(makeIssue("CONTRAST_LOW", `/color_scheme/${role}`,
          { ref: role, ratio: ratio.toFixed(2) }));
      }
    }
  }
  return issues;
}
