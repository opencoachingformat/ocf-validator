import type { Issue, OcfDoc } from "../types.js";
import type { DocContext } from "../context.js";
import { makeIssue } from "../codes.js";

const ENTITY_KEYS = ["player", "for_player", "on_player", "to_player"] as const;

export function referenceRules(doc: OcfDoc, ctx: DocContext): Issue[] {
  const issues: Issue[] = [];
  const frames = (((doc as { frames?: unknown[] }).frames ?? []) as Record<string, unknown>[]);

  frames.forEach((frame, fi) => {
    const frameId = frame.id as string | undefined;
    const actions = (frame.actions ?? []) as Record<string, unknown>[];
    actions.forEach((action, ai) => {
      for (const key of ENTITY_KEYS) {
        const ref = action[key];
        if (typeof ref === "string" && !ctx.entityRefs.has(ref)) {
          issues.push(makeIssue("REF_ENTITY_UNKNOWN",
            `/frames/${fi}/actions/${ai}/${key}`, { ref }, frameId));
        }
      }
      const ballId = action.ball_id;
      if (typeof ballId === "string" && !ctx.ballIds.has(ballId)) {
        issues.push(makeIssue("REF_BALL_UNKNOWN",
          `/frames/${fi}/actions/${ai}/ball_id`, { ref: ballId }, frameId));
      }
    });
    const branches = (frame.branches ?? {}) as Record<string, unknown>;
    for (const [outcome, target] of Object.entries(branches)) {
      if (typeof target === "string" && !ctx.frameIds.has(target)) {
        issues.push(makeIssue("REF_BRANCH_TARGET_UNKNOWN",
          `/frames/${fi}/branches/${outcome}`, { outcome, ref: target }, frameId));
      }
    }
  });
  return issues;
}
