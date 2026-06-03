import { test, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli.js";

const dir = mkdtempSync(join(tmpdir(), "ocf-cli-"));
function write(name: string, doc: unknown): string {
  const p = join(dir, name); writeFileSync(p, JSON.stringify(doc)); return p;
}
const good = {
  $schema: "https://opencoachingformat.org/schema/v1.json",
  meta: { id: "00000000-0000-4000-8000-000000000001", title: "t" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
  frames: [{ id: "f1", actions: [], end_state: { offense_1: { x: 0, y: 5 } } }],
};

test("exit 0 on a valid file", () => {
  const out: string[] = [];
  expect(runCli([write("ok.json", good)], { log: (s) => out.push(s) })).toBe(0);
});

test("exit 1 when errors are present", () => {
  const bad = { ...good, frames: [{ id: "f1" }] };
  const out: string[] = [];
  expect(runCli([write("bad.json", bad)], { log: (s) => out.push(s) })).toBe(1);
  expect(out.join("\n")).toMatch(/SCHEMA_INVALID/);
});

test("--json prints machine-readable result", () => {
  const out: string[] = [];
  expect(runCli(["--json", write("ok2.json", good)], { log: (s) => out.push(s) })).toBe(0);
  expect(() => JSON.parse(out.join("\n"))).not.toThrow();
});

test("--strict turns warnings into a failing exit code", () => {
  const warn = { ...good, frames: [{ id: "f1", actions: [], end_state: {} }] };
  const out: string[] = [];
  expect(runCli([write("warn.json", warn)], { log: (s) => out.push(s) })).toBe(0);
  expect(runCli(["--strict", write("warn2.json", warn)], { log: (s) => out.push(s) })).toBe(1);
});
