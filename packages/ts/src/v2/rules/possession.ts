import type { Issue } from "../../types.js";
import { isBranch, type DocContextV2 } from "../context.js";
import { makeIssue } from "../../codes.js";

const BALL_DEPENDENT = new Set(["pass", "shoot", "dribble"]);
const PICKUP = new Set(["pickup", "rebound"]);
const NO_BALL_MOVEMENT = new Set(["move", "cut"]);

// screen/defend/tackle/faceoff/check are intentionally untracked here: none
// carries a ball_id in the schema, so there is no possession effect to apply
// or check for them (this differs from NO_BALL_MOVEMENT, which actively
// checks that the actor is NOT holding a ball; these five get no check at
// all, since a screen/defend/etc. isn't disqualified by holding a ball).
// action_clear ALSO has a ball_id (an invasion-sport ball-clearing action)
// and would otherwise fit BALL_DEPENDENT's shape, but is left untracked
// deliberately: the schema itself $comments it "Reserved for invasion sports
// ... No variants defined yet" (schema/v1.json, action_clear) — i.e. it's a
// placeholder type with no finalized semantics yet, not a basketball action
// this validator currently needs to support. Revisit once invasion-sport
// action types are promoted out of "reserved" status.

type CarrierMap = Map<string, string | null>; // ball_id -> carrying player, or null if loose/dead
type LooseSet = Set<string>;

// Returns the resolved ball ids, or the "AMBIGUOUS" sentinel (NOT real ball ids)
// when neither ball_id nor ball_ids is given and multiple balls exist in the
// document. Mirrors v1's resolveBallId (single ball in doc -> assume it; zero
// balls -> no check; 2+ balls with nothing given -> AMBIGUOUS), extended for
// v2's ball_ids (plural, two-ball dribble) form.
function resolveBallIds(action: Record<string, unknown>, ctx: DocContextV2): string[] | "AMBIGUOUS" {
  if (typeof action.ball_id === "string") return [action.ball_id];
  if (Array.isArray(action.ball_ids)) {
    const ids = action.ball_ids.filter((b): b is string => typeof b === "string");
    if (ids.length > 0) return ids;
  }
  if (ctx.ballIds.size === 1) return [...ctx.ballIds];
  if (ctx.ballIds.size === 0) return [];
  return "AMBIGUOUS";
}

function playerHoldsAnyBall(player: string, carrier: CarrierMap): boolean {
  for (const holder of carrier.values()) if (holder === player) return true;
  return false;
}

function applyEffect(
  type: string,
  player: string,
  action: Record<string, unknown>,
  ballIds: string[],
  carrier: CarrierMap,
  loose: LooseSet,
): void {
  for (const ball of ballIds) {
    switch (type) {
      case "pass": {
        const to = action.to_player;
        carrier.set(ball, typeof to === "string" ? to : null);
        loose.delete(ball);
        break;
      }
      case "shoot":
        carrier.set(ball, null);
        loose.delete(ball);
        break;
      case "pickup":
      case "rebound":
        carrier.set(ball, player);
        loose.delete(ball);
        break;
      // dribble: carrier unchanged
    }
  }
}

export function possessionRulesV2(doc: Record<string, unknown>, ctx: DocContextV2): Issue[] {
  const issues: Issue[] = [];

  const carrier: CarrierMap = new Map();
  const loose: LooseSet = new Set();
  for (const b of ((doc.balls ?? []) as Record<string, unknown>[])) {
    const id = b.id;
    if (typeof id !== "string") continue;
    carrier.set(id, typeof b.carried_by === "string" ? b.carried_by : null);
    if (b.at !== undefined) loose.add(id);
  }

  function checkAndApply(item: Record<string, unknown>, path: string, localCarrier: CarrierMap, localLoose: LooseSet): void {
    if (isBranch(item)) {
      const cases = (item.cases ?? {}) as Record<string, { actions?: Record<string, unknown>[] }>;
      for (const [outcome, branchCase] of Object.entries(cases)) {
        // Fork state per case: each outcome is a hypothetical alternate
        // continuation, not a sequential extension shared with sibling cases.
        // A case's fork is also a dead end for possession purposes: we never
        // merge it back into the top-level walk after the branch returns, so
        // the top-level sequence continues from its own pre-branch state,
        // oblivious to what any case did. `then` (resuming the flat sequence
        // at an earlier/later action id) is a control-flow construct handled
        // elsewhere, not a possession-state merge point.
        const forkedCarrier = new Map(localCarrier);
        const forkedLoose = new Set(localLoose);
        const nested = branchCase.actions ?? [];
        nested.forEach((child, i) => checkAndApply(child, `${path}/cases/${outcome}/actions/${i}`, forkedCarrier, forkedLoose));
      }
      return;
    }

    const type = item.type as string;
    const player = item.player as string;

    if (NO_BALL_MOVEMENT.has(type) && playerHoldsAnyBall(player, localCarrier)) {
      issues.push(makeIssue("BALL_CARRIER_MISMATCH", path, { player, action: type }));
      return;
    }

    if (BALL_DEPENDENT.has(type)) {
      const ballIds = resolveBallIds(item, ctx);
      if (ballIds === "AMBIGUOUS") {
        issues.push(makeIssue("BALL_AMBIGUOUS", path, { player, count: ctx.ballIds.size }));
        return;
      }
      for (const ball of ballIds) {
        if (localCarrier.get(ball) !== player) {
          issues.push(makeIssue("BALL_CARRIER_MISMATCH", path, { player, action: type, ball_id: ball }));
        }
      }
      if (ctx.entityRefs.get(player)?.type === "defense") {
        issues.push(makeIssue("ACTION_UNUSUAL_CARRIER", path, { player, action: type }));
      }
      applyEffect(type, player, item, ballIds, localCarrier, localLoose);
    } else if (PICKUP.has(type)) {
      const ballIds = resolveBallIds(item, ctx);
      if (ballIds === "AMBIGUOUS") {
        issues.push(makeIssue("BALL_AMBIGUOUS", path, { player, count: ctx.ballIds.size }));
        return;
      }
      for (const ball of ballIds) {
        if (!localLoose.has(ball)) {
          issues.push(makeIssue("BALL_NOT_AT_LOCATION", path, { player, action: type }));
        } else {
          applyEffect(type, player, item, [ball], localCarrier, localLoose);
        }
      }
    }
  }

  const topLevel = ((doc.actions ?? []) as Record<string, unknown>[]);
  topLevel.forEach((item, i) => checkAndApply(item, `/actions/${i}`, carrier, loose));

  return issues;
}
