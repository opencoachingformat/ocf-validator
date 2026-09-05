import type { Issue } from "../../types.js";
import { walkActions, isBranch, type DocContextV2 } from "../context.js";
import { knownNamed } from "../../named-positions.js";
import { makeIssue } from "../../codes.js";

const _ENTITY_KEYS = ["player", "for_player", "on_player", "to_player", "guards_player", "around_player", "off_screen_by"];

function walkNamed(
  node: unknown,
  pointer: string,
  known: Set<string>,
  out: Issue[],
): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkNamed(v, `${pointer}/${i}`, known, out));
  } else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const named = obj.named;
    if (typeof named === "string" && !known.has(named)) {
      out.push(makeIssue("REF_NAMED_POS_UNKNOWN", `${pointer}/named`, { ref: named }));
    }
    for (const [k, v] of Object.entries(obj)) walkNamed(v, `${pointer}/${k}`, known, out);
  }
}

export function referenceRulesV2(doc: Record<string, unknown>, ctx: DocContextV2): Issue[] {
  const issues: Issue[] = [];
  const known = knownNamed(doc);
  const topLevel = ((doc.actions ?? []) as Record<string, unknown>[]);

  walkActions(topLevel, (item, path) => {
    if (isBranch(item)) {
      const on = item.on;
      if (typeof on === "string" && !ctx.actionIds.has(on)) {
        issues.push(makeIssue("REF_BRANCH_ON_UNKNOWN", `${path}/on`, { ref: on }));
      }
      return;
    }
    const action = item;
    for (const key of _ENTITY_KEYS) {
      const ref = action[key];
      if (typeof ref === "string" && !ctx.entityRefs.has(ref)) {
        issues.push(makeIssue("REF_ENTITY_UNKNOWN", `${path}/${key}`, { ref }));
      }
    }
    const ballId = action.ball_id;
    if (typeof ballId === "string" && !ctx.ballIds.has(ballId)) {
      issues.push(makeIssue("REF_BALL_UNKNOWN", `${path}/ball_id`, { ref: ballId }));
    }
    const ballIds = action.ball_ids;
    if (Array.isArray(ballIds)) {
      ballIds.forEach((bid, i) => {
        if (typeof bid === "string" && !ctx.ballIds.has(bid)) {
          issues.push(makeIssue("REF_BALL_UNKNOWN", `${path}/ball_ids/${i}`, { ref: bid }));
        }
      });
    }
    const trigger = action.trigger as Record<string, unknown> | undefined;
    if (trigger && typeof trigger.ref === "string" && !ctx.actionIds.has(trigger.ref)) {
      issues.push(makeIssue("REF_TRIGGER_ACTION_UNKNOWN", `${path}/trigger/ref`, { ref: trigger.ref }));
    }
    walkNamed(action.moves, `${path}/moves`, known, issues);
  });

  return issues;
}
