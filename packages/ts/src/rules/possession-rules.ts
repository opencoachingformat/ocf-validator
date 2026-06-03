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

    // Intra-frame possession: actions within a frame execute in sequence, so an
    // earlier transfer (e.g. a `pass` to a teammate who then `shoot`s on the
    // catch) changes who currently carries the ball BEFORE a later action is
    // checked. We seed a mutable carrier map from the frame-start snapshot and
    // advance it as we walk the actions, so "currently carries" (design §B) is
    // evaluated at the point each action runs — not only at frame entry. The
    // frame's own end_state is still the cross-frame source of truth (engine
    // snapshots), so we never write back here.
    const carrier = new Map<string, string | null>();
    const loose = new Set<string>();
    for (const id of ctx.ballIds) {
      carrier.set(id, state.carrierOf(id));
      if (state.looseAt(id) !== null) loose.add(id);
    }

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
        if (ball && carrier.get(ball) !== player) {
          issues.push(makeIssue("BALL_CARRIER_MISMATCH", path,
            { player, action: type, ball_id: ball }, frameId));
        }
        if (ctx.entityRefs.get(player)?.type === "defense") {
          issues.push(makeIssue("ACTION_UNUSUAL_CARRIER", path, { player, action: type }, frameId));
        }
        // Apply the action's effect on possession for subsequent actions.
        if (ball) applyEffect(type, player, action, ball, carrier, loose);
      } else if (PICKUP.has(type)) {
        const ball = resolveBallId(action, ctx);
        if (ball === "AMBIGUOUS") {
          issues.push(makeIssue("BALL_AMBIGUOUS", path, { player, count: ctx.ballIds.size }, frameId));
        } else if (ball && !loose.has(ball)) {
          // pickup/rebound needs a LOOSE ball. If it's not loose (carried by someone,
          // or dead) it cannot be picked up. (An unknown ball id is separately caught
          // by REF_BALL_UNKNOWN, so no guard is needed here.)
          issues.push(makeIssue("BALL_NOT_AT_LOCATION", path, { player, action: type }, frameId));
        } else if (ball) {
          applyEffect(type, player, action, ball, carrier, loose);
        }
      }
    });
  });
  return issues;
}

// Advance the intra-frame possession model after an action has been checked.
function applyEffect(
  type: string,
  player: string,
  action: Record<string, unknown>,
  ball: string,
  carrier: Map<string, string | null>,
  loose: Set<string>,
): void {
  switch (type) {
    case "pass": {
      const to = action.to_player;
      // After a pass the receiver carries the ball (in flight is modelled as the
      // receiver's possession for the purpose of a catch-and-shoot in the frame).
      carrier.set(ball, typeof to === "string" ? to : null);
      loose.delete(ball);
      break;
    }
    case "shoot":
      // The ball leaves the shooter; it is no longer carried.
      carrier.set(ball, null);
      loose.delete(ball);
      break;
    case "pickup":
    case "rebound":
      carrier.set(ball, player);
      loose.delete(ball);
      break;
    // `dribble` keeps the same carrier — no change.
  }
}
