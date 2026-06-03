import { test, expect } from "vitest";
import { buildContext } from "../../src/context.js";
import { referenceRules } from "../../src/rules/references.js";

function run(doc: any) { return referenceRules(doc, buildContext(doc)); }

test("unknown branch target is flagged", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }], balls: [],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [
      { id: "f1", actions: [{ player: "offense_1", type: "shoot" }],
        end_state: {}, branches: { make: "f2", miss: "f9" } },
      { id: "f2", actions: [], end_state: {} },
    ],
  };
  const issues = run(doc);
  expect(issues.map((i) => i.code)).toContain("REF_BRANCH_TARGET_UNKNOWN");
  const issue = issues.find((i) => i.code === "REF_BRANCH_TARGET_UNKNOWN")!;
  expect(issue.data).toMatchObject({ outcome: "miss", ref: "f9" });
  expect(issue.path).toBe("/frames/0/branches/miss");
});

test("action referencing an undeclared player is flagged", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }], balls: [],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_7", type: "move", moves: [] }], end_state: {} }],
  };
  expect(run(doc).some((i) => i.code === "REF_ENTITY_UNKNOWN")).toBe(true);
});

test("a fully consistent doc yields no reference issues", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "shoot", ball_id: "ball_1" }],
      end_state: {}, branches: { make: "f1" } }],
  };
  expect(run(doc)).toEqual([]);
});
