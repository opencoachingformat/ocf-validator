import type { Issue, OcfDoc } from "../types.js";
import { getFrames, type DocContext } from "../context.js";
import type { FrameState } from "../possession.js";
import { makeIssue } from "../codes.js";

const BALL_DEPENDENT = new Set(["pass", "shoot", "dribble"]);
const PICKUP = new Set(["pickup", "rebound"]);

// Returns the resolved ball id, or the "AMBIGUOUS" sentinel (NOT a real ball id)
// when ball_id is omitted with multiple balls in play, or null when no ball exists.
function resolveBallId(action: Record<string, unknown>, ctx: DocContext): string | "AMBIGUOUS" | null {
  if (typeof action.ball_id === "string") return action.ball_id;
  if (ctx.ballIds.size === 1) return [...ctx.ballIds][0];
  if (ctx.ballIds.size === 0) return null;
  return "AMBIGUOUS";
}

export function possessionRules(doc: OcfDoc, ctx: DocContext, states: FrameState[]): Issue[] {
  const issues: Issue[] = [];
  const frames = getFrames(doc);

  frames.forEach((frame, fi) => {
    const frameId = frame.id as string | undefined;
    const state = states[fi];
    const actions = (frame.actions ?? []) as Record<string, unknown>[];

    actions.forEach((action, ai) => {
      const type = action.type as string;
      const player = action.player as string;
      const path = `/frames/${fi}/actions/${ai}`;

      if (BALL_DEPENDENT.has(type)) {
        const ball = resolveBallId(action, ctx);
        if (ball === "AMBIGUOUS") {
          issues.push(makeIssue("BALL_AMBIGUOUS", path, { player, count: ctx.ballIds.size }, frameId));
          return;
        }
        if (ball && state.carrierOf(ball) !== player) {
          issues.push(makeIssue("BALL_CARRIER_MISMATCH", path,
            { player, action: type, ball_id: ball }, frameId));
        }
        if (ctx.entityRefs.get(player)?.type === "defense") {
          issues.push(makeIssue("ACTION_UNUSUAL_CARRIER", path, { player, action: type }, frameId));
        }
      } else if (PICKUP.has(type)) {
        const ball = resolveBallId(action, ctx);
        if (ball === "AMBIGUOUS") {
          issues.push(makeIssue("BALL_AMBIGUOUS", path, { player, count: ctx.ballIds.size }, frameId));
        } else if (ball && state.looseAt(ball) === null) {
          // pickup/rebound needs a LOOSE ball. If it's not loose (carried by someone,
          // or dead) it cannot be picked up. (An unknown ball id is separately caught
          // by REF_BALL_UNKNOWN, so no guard is needed here.)
          issues.push(makeIssue("BALL_NOT_AT_LOCATION", path, { player, action: type }, frameId));
        }
      }
    });
  });
  return issues;
}
