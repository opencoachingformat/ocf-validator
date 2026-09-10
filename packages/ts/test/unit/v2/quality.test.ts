import { test, expect } from "vitest";
import { qualityRulesV2 } from "../../../src/v2/rules/quality.js";
import { buildContextV2 } from "../../../src/v2/context.js";

function run(doc: Record<string, unknown>) { return qualityRulesV2(doc, buildContextV2(doc)); }

test("a coordinate outside the FIBA court is ENTITY_OFFCOURT", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 99, y: 0 }],
    balls: [], court: { court_profile: "fiba", type: "full_court" },
    actions: [],
  };
  expect(run(doc).some((i) => i.code === "ENTITY_OFFCOURT")).toBe(true);
});

test("a coordinate inside the FIBA court is clean", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [], court: { court_profile: "fiba", type: "full_court" },
    actions: [],
  };
  expect(run(doc).some((i) => i.code === "ENTITY_OFFCOURT")).toBe(false);
});

test("ENTITY_OFFCOURT is based on doc.entities starting positions, not action move targets", () => {
  // Matches v1's qualityRules: the off-court check walks doc.entities only,
  // so an out-of-bounds action move destination is NOT itself flagged.
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    court: { court_profile: "fiba", type: "full_court" },
    actions: [
      { id: "a1", player: "offense_1", type: "shoot", ball_id: "ball_1" },
      {
        id: "branch_1", on: "a1",
        cases: {
          make: { actions: [], then: null },
          miss: {
            actions: [{ id: "a2", player: "offense_1", type: "move", moves: [{ to: { x: 200, y: 0 } }] }],
            then: null,
          },
        },
      },
    ],
  };
  expect(run(doc).some((i) => i.code === "ENTITY_OFFCOURT")).toBe(false);
});

test("a ruleset with no known court dimensions skips the off-court check entirely", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 9999, y: 9999 }],
    balls: [], court: { court_profile: "custom", type: "full_court" },
    actions: [],
  };
  expect(run(doc).some((i) => i.code === "ENTITY_OFFCOURT")).toBe(false);
});

test("low fill-vs-stroke contrast is CONTRAST_LOW", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }],
    balls: [], court: { court_profile: "fiba", type: "full_court" },
    color_scheme: { offense_fill: "#fefefe", offense_stroke: "#ffffff" },
    actions: [{ id: "a1", player: "offense_1", type: "move", moves: [{ to: { x: 1, y: 1 } }] }],
  };
  expect(run(doc).some((i) => i.code === "CONTRAST_LOW")).toBe(true);
});

test("good fill-vs-stroke contrast is clean", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }],
    balls: [], court: { court_profile: "fiba", type: "full_court" },
    color_scheme: { offense_fill: "#003366", offense_stroke: "#ffffff" },
    actions: [{ id: "a1", player: "offense_1", type: "move", moves: [{ to: { x: 1, y: 1 } }] }],
  };
  expect(run(doc).some((i) => i.code === "CONTRAST_LOW")).toBe(false);
});

test("no color_scheme means no contrast check at all", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }],
    balls: [], court: { court_profile: "fiba", type: "full_court" },
    actions: [],
  };
  expect(run(doc).some((i) => i.code === "CONTRAST_LOW")).toBe(false);
});

test("an empty actions[] array is NOT flagged (EMPTY_FRAME has no v2 equivalent)", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }],
    balls: [], court: { court_profile: "fiba", type: "full_court" },
    actions: [],
  };
  expect(run(doc).some((i) => i.code === "EMPTY_FRAME")).toBe(false);
});
