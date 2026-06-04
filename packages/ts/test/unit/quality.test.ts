import { test, expect } from "vitest";
import { qualityRules } from "../../src/rules/quality.js";
import { buildContext } from "../../src/context.js";

function run(doc: any) { return qualityRules(doc, buildContext(doc)); }

test("a coordinate outside the FIBA court is ENTITY_OFFCOURT", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 99, y: 0 }],
    balls: [], court: { ruleset: "fiba", type: "full_court" },
    frames: [{ id: "f1", actions: [], end_state: {} }],
  };
  expect(run(doc).some((i) => i.code === "ENTITY_OFFCOURT")).toBe(true);
});

test("an empty frame is EMPTY_FRAME", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }],
    balls: [], court: { ruleset: "fiba", type: "full_court" },
    frames: [{ id: "f1", actions: [], end_state: {} }],
  };
  expect(run(doc).some((i) => i.code === "EMPTY_FRAME")).toBe(true);
});

test("low fill-vs-stroke contrast is CONTRAST_LOW", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }],
    balls: [], court: { ruleset: "fiba", type: "full_court" },
    color_scheme: { offense_fill: "#fefefe", offense_stroke: "#ffffff" },
    frames: [{ id: "f1", actions: [{ player: "offense_1", type: "move", moves: [] }], end_state: {} }],
  };
  expect(run(doc).some((i) => i.code === "CONTRAST_LOW")).toBe(true);
});

test("good fill-vs-stroke contrast is clean", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }],
    balls: [], court: { ruleset: "fiba", type: "full_court" },
    color_scheme: { offense_fill: "#003366", offense_stroke: "#ffffff" },
    frames: [{ id: "f1", actions: [{ player: "offense_1", type: "move", moves: [] }], end_state: {} }],
  };
  expect(run(doc).some((i) => i.code === "CONTRAST_LOW")).toBe(false);
});
