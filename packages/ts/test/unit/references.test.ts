import { test, expect } from "vitest";
import type { OcfDoc } from "../../src/types.js";
import { buildContext } from "../../src/context.js";
import { referenceRules } from "../../src/rules/references.js";

function run(doc: OcfDoc) { return referenceRules(doc, buildContext(doc)); }

test("unknown branch target is flagged", () => {
  const doc: OcfDoc = {
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
  const doc: OcfDoc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }], balls: [],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_7", type: "move", moves: [] }], end_state: {} }],
  };
  expect(run(doc).some((i) => i.code === "REF_ENTITY_UNKNOWN")).toBe(true);
  const issue = run(doc).find((i) => i.code === "REF_ENTITY_UNKNOWN")!;
  expect(issue.data).toMatchObject({ ref: "offense_7" });
  expect(issue.path).toBe("/frames/0/actions/0/player");
});

test("action referencing an undeclared ball_id is flagged", () => {
  const doc: OcfDoc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "shoot", ball_id: "ball_99" }],
      end_state: {} }],
  };
  const issues = run(doc);
  expect(issues.some((i) => i.code === "REF_BALL_UNKNOWN")).toBe(true);
  const issue = issues.find((i) => i.code === "REF_BALL_UNKNOWN")!;
  expect(issue.data).toMatchObject({ ref: "ball_99" });
  expect(issue.path).toBe("/frames/0/actions/0/ball_id");
});

test("a secondary entity key (to_player) is also checked", () => {
  const doc: OcfDoc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "pass", to_player: "offense_99", ball_id: "ball_1" }],
      end_state: {} }],
  };
  const issue = run(doc).find((i) => i.code === "REF_ENTITY_UNKNOWN")!;
  expect(issue.data).toMatchObject({ ref: "offense_99" });
  expect(issue.path).toBe("/frames/0/actions/0/to_player");
});

test("a fully consistent doc yields no reference issues", () => {
  const doc: OcfDoc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "shoot", ball_id: "ball_1" }],
      end_state: {}, branches: { make: "f1" } }],
  };
  expect(run(doc)).toEqual([]);
});
