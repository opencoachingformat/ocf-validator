import type { Issue } from "../../types.js";
import { walkActions, isBranch, type DocContextV2 } from "../context.js";
import { makeIssue } from "../../codes.js";

/**
 * Position of every action id in flat document order (top-level only; a
 * nested branch-case action's "position" for loop-direction purposes is
 * defined as the position of the branch that contains it, since a loop
 * target is always compared against where a case's OWN branch sits).
 */
function topLevelPositions(topLevel: Record<string, unknown>[]): Map<string, number> {
  const positions = new Map<string, number>();
  topLevel.forEach((item, i) => {
    if (typeof item.id === "string") positions.set(item.id, i);
  });
  return positions;
}

export function branchRulesV2(doc: Record<string, unknown>, ctx: DocContextV2): Issue[] {
  const issues: Issue[] = [];
  const topLevel = ((doc.actions ?? []) as Record<string, unknown>[]);
  const positions = topLevelPositions(topLevel);
  let anyLoopsBackward = false;

  walkActions(topLevel, (item, path) => {
    if (!isBranch(item)) return;
    const branchPos = positions.get(item.id as string);
    const cases = (item.cases ?? {}) as Record<string, { then?: string | null }>;
    for (const [outcome, branchCase] of Object.entries(cases)) {
      const then = branchCase.then;
      if (then === null || then === undefined) continue;
      if (!ctx.actionIds.has(then)) {
        issues.push(makeIssue("REF_BRANCH_THEN_UNKNOWN", `${path}/cases/${outcome}/then`, { ref: then }));
        continue;
      }
      // NOTE: `positions` only has top-level ids, so a `then` pointing at an
      // action nested inside a branch case yields targetPos === undefined
      // here and is silently skipped for loop-direction purposes (it never
      // counts toward "loops backward"), even though it is a valid resolved
      // reference. Only top-level-to-top-level `then` edges are considered
      // by this heuristic.
      const targetPos = positions.get(then);
      if (branchPos !== undefined && targetPos !== undefined && targetPos < branchPos) {
        anyLoopsBackward = true;
      }
    }
  });

  if (doc.continuum === true && !anyLoopsBackward) {
    issues.push(makeIssue("CONTINUUM_NO_LOOP_BACK", "/continuum", {}));
  }

  return issues;
}
