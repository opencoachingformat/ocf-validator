import type { Issue } from "../../types.js";
import { walkActions, isBranch, type DocContextV2 } from "../context.js";
import { knownNamed } from "../../named-positions.js";
import { makeIssue } from "../../codes.js";

const _ENTITY_KEYS = ["player", "for_player", "on_player", "to_player", "guards_player", "around_player", "off_screen_by"];

// Same entity-ref keys as _ENTITY_KEYS, but checked here too because move_step
// objects (inside moves[]) carry their own around_player/off_screen_by,
// independent of any same-named key on the enclosing action (e.g. action_cut
// has both a top-level around_player default AND a per-step override).
const _MOVE_STEP_ENTITY_KEYS = ["around_player", "off_screen_by"];

function walkNamed(
  node: unknown,
  pointer: string,
  known: Set<string>,
  entityRefs: Map<string, unknown>,
  out: Issue[],
): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkNamed(v, `${pointer}/${i}`, known, entityRefs, out));
  } else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const named = obj.named;
    if (typeof named === "string" && !known.has(named)) {
      out.push(makeIssue("REF_NAMED_POS_UNKNOWN", `${pointer}/named`, { ref: named }));
    }
    for (const key of _MOVE_STEP_ENTITY_KEYS) {
      const ref = obj[key];
      if (typeof ref === "string" && !entityRefs.has(ref)) {
        out.push(makeIssue("REF_ENTITY_UNKNOWN", `${pointer}/${key}`, { ref }));
      }
    }
    for (const [k, v] of Object.entries(obj)) walkNamed(v, `${pointer}/${k}`, known, entityRefs, out);
  }
}

// meta.based_on_formation.adjustments[].entity is a document-level entity_ref
// (external formation-registry provenance, not per-action), so it's checked
// once against the whole document rather than inside the actions walk.
function checkFormationAdjustments(doc: Record<string, unknown>, ctx: DocContextV2, out: Issue[]): void {
  const meta = doc.meta as Record<string, unknown> | undefined;
  const basedOnFormation = meta?.based_on_formation as { adjustments?: unknown[] } | undefined;
  const adjustments = basedOnFormation?.adjustments;
  if (!Array.isArray(adjustments)) return;
  adjustments.forEach((adj, i) => {
    const entity = (adj as Record<string, unknown> | undefined)?.entity;
    if (typeof entity === "string" && !ctx.entityRefs.has(entity)) {
      out.push(makeIssue("REF_ENTITY_UNKNOWN",
        `/meta/based_on_formation/adjustments/${i}/entity`, { ref: entity }));
    }
  });
}

export function referenceRulesV2(doc: Record<string, unknown>, ctx: DocContextV2): Issue[] {
  const issues: Issue[] = [];
  const known = knownNamed(doc);
  const topLevel = ((doc.actions ?? []) as Record<string, unknown>[]);
  checkFormationAdjustments(doc, ctx, issues);

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
    walkNamed(action.moves, `${path}/moves`, known, ctx.entityRefs, issues);

    const sideEffects = action.side_effects;
    if (Array.isArray(sideEffects)) {
      sideEffects.forEach((se, i) => {
        const on = (se as Record<string, unknown> | undefined)?.on;
        if (typeof on === "string" && !ctx.entityRefs.has(on)) {
          issues.push(makeIssue("REF_ENTITY_UNKNOWN", `${path}/side_effects/${i}/on`, { ref: on }));
        }
      });
    }
  });

  return issues;
}
