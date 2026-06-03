import type { Issue, OcfDoc } from "../types.js";
import type { DocContext } from "../context.js";
import { getFrames } from "../context.js";
import { makeIssue } from "../codes.js";

function coordKey(c: unknown): string | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  if (typeof o.named === "string") return `named:${o.named}`;
  if (typeof o.x === "number" && typeof o.y === "number") return `xy:${o.x},${o.y}`;
  return null;
}

// Two coords are only comparable when expressed in the same form (both named, or
// both x/y). The validator does NOT resolve named positions to coordinates
// (deferred), so a named-vs-xy pair is treated as "not comparable" rather than a
// disagreement — this avoids false positives. The Python mirror must do the same.
function sameNamespace(a: string, b: string): boolean {
  return (a.startsWith("named:") && b.startsWith("named:")) ||
         (a.startsWith("xy:") && b.startsWith("xy:"));
}

export function coherenceRules(doc: OcfDoc, _ctx: DocContext): Issue[] {
  const issues: Issue[] = [];
  const frames = getFrames(doc);

  frames.forEach((frame, fi) => {
    const frameId = frame.id as string | undefined;
    const endState = (frame.end_state ?? {}) as Record<string, unknown>;
    const actions = (frame.actions ?? []) as Record<string, unknown>[];

    // Each action is checked independently against end_state. If a player has
    // multiple move actions in one frame, each whose last `to` disagrees with
    // end_state produces its own END_STATE_DISAGREE. (No action-ordering/supersede
    // semantics in v1.)
    for (const action of actions) {
      const player = action.player as string | undefined;
      if (!player || !(player in endState)) continue;
      const moves = action.moves as Array<Record<string, unknown>> | undefined;
      if (!moves || moves.length === 0) continue;
      const lastTo = moves[moves.length - 1]?.to;
      const endKey = coordKey(endState[player]);
      const toKey = coordKey(lastTo);
      if (endKey && toKey && sameNamespace(endKey, toKey) && endKey !== toKey) {
        issues.push(makeIssue("END_STATE_DISAGREE",
          `/frames/${fi}/end_state/${player}`, { ref: player }, frameId));
      }
    }

    const next = frames[fi + 1];
    if (next) {
      const start = (next.start_state ?? {}) as Record<string, unknown>;
      for (const [ref, coord] of Object.entries(start)) {
        if (ref === "balls") continue;
        const a = coordKey(coord), b = coordKey(endState[ref]);
        if (a && b && sameNamespace(a, b) && a !== b) {
          issues.push(makeIssue("START_STATE_DISCONTINUITY",
            `/frames/${fi + 1}/start_state/${ref}`, { ref }, next.id as string));
        }
      }
    }
  });
  return issues;
}
