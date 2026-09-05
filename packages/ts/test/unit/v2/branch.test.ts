import { test, expect } from "vitest";
import { branchRulesV2 } from "../../../src/v2/rules/branch.js";
import { buildContextV2 } from "../../../src/v2/context.js";

function run(doc: Record<string, unknown>) {
  return branchRulesV2(doc, buildContextV2(doc));
}

test("flags a then pointing at an unknown action id", () => {
  const doc = {
    actions: [
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "a1", cases: { make: { actions: [], then: "does_not_exist" } } },
    ],
  };
  const issues = run(doc);
  expect(issues.some((i) => i.code === "REF_BRANCH_THEN_UNKNOWN")).toBe(true);
});

test("accepts then: null (explicit terminal)", () => {
  const doc = {
    actions: [
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "a1", cases: { make: { actions: [], then: null } } },
    ],
  };
  expect(run(doc)).toEqual([]);
});

test("accepts then pointing at a real, earlier action id (loop anchor)", () => {
  const doc = {
    actions: [
      { id: "a0", player: "offense_1", type: "move", moves: [{ to: { x: 0, y: 0 } }] },
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "a1", cases: { make: { actions: [], then: "a0" } } },
    ],
  };
  expect(run(doc)).toEqual([]);
});

test("warns when continuum:true but nothing loops backward", () => {
  const doc = {
    continuum: true,
    actions: [
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "a1", cases: { make: { actions: [], then: null }, miss: { actions: [], then: null } } },
    ],
  };
  const issues = run(doc);
  expect(issues.some((i) => i.code === "CONTINUUM_NO_LOOP_BACK")).toBe(true);
});

test("no warning when continuum:true and a then loops backward", () => {
  const doc = {
    continuum: true,
    actions: [
      { id: "a0", player: "offense_1", type: "move", moves: [{ to: { x: 0, y: 0 } }] },
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "a1", cases: { make: { actions: [], then: "a0" }, miss: { actions: [], then: null } } },
    ],
  };
  const issues = run(doc);
  expect(issues.some((i) => i.code === "CONTINUUM_NO_LOOP_BACK")).toBe(false);
});

test("no warning when continuum is absent/false", () => {
  const doc = {
    actions: [
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "a1", cases: { make: { actions: [], then: null } } },
    ],
  };
  expect(run(doc).some((i) => i.code === "CONTINUUM_NO_LOOP_BACK")).toBe(false);
});
