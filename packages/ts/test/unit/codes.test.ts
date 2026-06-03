import { test, expect } from "vitest";
import { makeIssue, CODES } from "../../src/codes.js";

test("makeIssue fills template and severity from the registry", () => {
  const issue = makeIssue("BALL_CARRIER_MISMATCH", "/frames/2/actions/0", {
    player: "offense_2", action: "pass", ball_id: "ball_1",
  }, "frame_3");
  expect(issue.severity).toBe("error");
  expect(issue.message).toBe(
    "Player 'offense_2' performs pass but does not carry ball 'ball_1'.");
  expect(issue.path).toBe("/frames/2/actions/0");
  expect(issue.frame).toBe("frame_3");
  expect(issue.data).toMatchObject({ player: "offense_2" });
});

test("registry has an entry for documented codes", () => {
  expect(CODES.REF_BRANCH_TARGET_UNKNOWN.severity).toBe("error");
  expect(CODES.CONTRAST_LOW.severity).toBe("warning");
});

test("makeIssue throws on an unknown code", () => {
  expect(() => makeIssue("NOPE_NOT_A_CODE", "/")).toThrow(/unknown error code/i);
});

test("unmatched template tokens are left intact", () => {
  // ENTITY_OFFCOURT template: "Coordinate ({x},{y}) lies outside the {ruleset} court."
  const issue = makeIssue("ENTITY_OFFCOURT", "/entities", { x: 1 });
  expect(issue.message).toContain("(1,{y})");
  expect(issue.message).toContain("{ruleset}");
});

test("null/undefined data values leave the token intact (no 'null' in message)", () => {
  const issue = makeIssue("REF_ENTITY_UNKNOWN", "/x", { ref: null });
  expect(issue.message).not.toContain("null");
  expect(issue.message).toContain("{ref}");
});

test("optional fields are omitted when absent", () => {
  const issue = makeIssue("EMPTY_FRAME", "/frames/0");
  expect("frame" in issue).toBe(false);
  expect("data" in issue).toBe(false); // empty data omitted
});
