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

test("low-contrast color_scheme is CONTRAST_LOW", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }],
    balls: [], court: { ruleset: "fiba", type: "full_court" },
    color_scheme: { offense: "#fefefe", background: "#ffffff" },
    frames: [{ id: "f1", actions: [{ player: "offense_1", type: "move", moves: [] }], end_state: {} }],
  };
  expect(run(doc).some((i) => i.code === "CONTRAST_LOW")).toBe(true);
});
