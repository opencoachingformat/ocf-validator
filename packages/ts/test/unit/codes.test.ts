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
