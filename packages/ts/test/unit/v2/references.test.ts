import { test, expect } from "vitest";
import { referenceRulesV2 } from "../../../src/v2/rules/references.js";
import { buildContextV2 } from "../../../src/v2/context.js";

function ctxFor(doc: Record<string, unknown>) {
  return buildContextV2(doc);
}

test("flags an action referencing an unknown entity", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    actions: [{ id: "a1", player: "offense_9", type: "cut", moves: [{ to: { x: 1, y: 1 } }] }],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_ENTITY_UNKNOWN")).toBe(true);
});

test("flags a trigger.ref pointing at an unknown action id", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    actions: [
      { id: "a1", player: "offense_1", type: "move", moves: [{ to: { x: 1, y: 1 } }],
        trigger: { type: "action_end", ref: "does_not_exist" } },
    ],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_TRIGGER_ACTION_UNKNOWN")).toBe(true);
});

test("accepts a trigger.ref pointing at a real action id", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    actions: [
      { id: "a1", player: "offense_1", type: "move", moves: [{ to: { x: 1, y: 1 } }] },
      { id: "a2", player: "offense_1", type: "move", moves: [{ to: { x: 2, y: 2 } }],
        trigger: { type: "action_end", ref: "a1" } },
    ],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_TRIGGER_ACTION_UNKNOWN")).toBe(false);
});

test("flags a branch.on pointing at an unknown action id", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    actions: [
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "does_not_exist", cases: { make: { actions: [], then: null } } },
    ],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_BRANCH_ON_UNKNOWN")).toBe(true);
});

test("accepts a branch.on pointing at a real action id", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    actions: [
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "a1", cases: { make: { actions: [], then: null } } },
    ],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_BRANCH_ON_UNKNOWN")).toBe(false);
});

test("flags an action referencing an unknown ball_id", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }, { type: "offense", nr: 2, x: 1, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    actions: [{ id: "a1", player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_9" }],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_BALL_UNKNOWN")).toBe(true);
});

test("flags an unknown around_player inside a move_step (not just on the action itself)", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    actions: [
      { id: "a1", player: "offense_1", type: "dribble", ball_id: "ball_1",
        moves: [{ to: { x: 1, y: 1 }, around_player: "offense_9" }] },
    ],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_ENTITY_UNKNOWN" && i.path.includes("around_player"))).toBe(true);
});

test("accepts a known around_player inside a move_step", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }, { type: "defense", nr: 1, x: 0, y: 6 }],
    actions: [
      { id: "a1", player: "offense_1", type: "dribble", ball_id: "ball_1",
        moves: [{ to: { x: 1, y: 1 }, around_player: "defense_1" }] },
    ],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_ENTITY_UNKNOWN")).toBe(false);
});

test("checks reference integrity inside nested branch case actions too", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    actions: [
      { id: "a1", player: "offense_1", type: "shoot" },
      {
        id: "branch_1", on: "a1",
        cases: { make: { actions: [{ id: "a2", player: "offense_9", type: "move", moves: [{ to: { x: 1, y: 1 } }] }], then: null } },
      },
    ],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_ENTITY_UNKNOWN" && i.path.includes("/cases/make/"))).toBe(true);
});
