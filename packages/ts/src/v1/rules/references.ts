import type { Issue, OcfDoc } from "../../types.js";
import { getFrames, type DocContext } from "../context.js";
import { makeIssue } from "../../codes.js";
import { knownNamed } from "../../named-positions.js";

const ENTITY_KEYS = ["player", "for_player", "on_player", "to_player"] as const;

function walkNamed(
  node: unknown, pointer: string, known: Set<string>,
  frameId: string | undefined, out: Issue[],
): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkNamed(v, `${pointer}/${i}`, known, frameId, out));
  } else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.named === "string" && !known.has(obj.named)) {
      out.push(makeIssue("REF_NAMED_POS_UNKNOWN",
        `${pointer}/named`, { ref: obj.named }, frameId));
    }
    for (const [k, v] of Object.entries(obj)) {
      walkNamed(v, `${pointer}/${k}`, known, frameId, out);
    }
  }
}

// meta.based_on_formation.adjustments[].entity is a document-level entity_ref
// (external formation-registry provenance, not per-frame/per-action), so it's
// checked once against the whole document rather than inside the frame loop.
function checkFormationAdjustments(doc: OcfDoc, ctx: DocContext, out: Issue[]): void {
  const meta = (doc as { meta?: Record<string, unknown> }).meta;
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

export function referenceRules(doc: OcfDoc, ctx: DocContext): Issue[] {
  const issues: Issue[] = [];
  const frames = getFrames(doc);
  const known = knownNamed(doc as Record<string, unknown>);
  checkFormationAdjustments(doc, ctx, issues);

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
    walkNamed(frame.actions, `/frames/${fi}/actions`, known, frameId, issues);
    walkNamed(frame.end_state, `/frames/${fi}/end_state`, known, frameId, issues);
    walkNamed(frame.start_state, `/frames/${fi}/start_state`, known, frameId, issues);
  });
  return issues;
}
