#!/usr/bin/env node
import pc from "picocolors";
import { validateFile } from "./validate.js";
import type { Result, Issue } from "./types.js";

interface Io { log: (s: string) => void; }

function formatIssue(i: Issue): string {
  const tag = i.severity === "error" ? pc.red("error") : pc.yellow("warn ");
  const loc = i.frame ? `${i.path} (${i.frame})` : i.path;
  return `  ${tag} ${pc.bold(i.code)} ${loc}\n        ${i.message}`;
}

function printHuman(file: string, res: Result, io: Io): void {
  if (res.valid && res.warnings.length === 0) { io.log(`${pc.green("ok")} ${file}`); return; }
  io.log(`${res.valid ? pc.yellow("warn") : pc.red("fail")} ${file}`);
  for (const e of res.errors) io.log(formatIssue(e));
  for (const w of res.warnings) io.log(formatIssue(w));
  io.log(`  ${res.summary.errors} error(s), ${res.summary.warnings} warning(s)`);
}

export function runCli(argv: string[], io: Io = { log: console.log }): number {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const files = argv.filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    io.log("usage: ocf-validate [--json] [--quiet] [--strict] <file.ocf.json> ...");
    return 2;
  }
  const asJson = flags.has("--json"), quiet = flags.has("--quiet"), strict = flags.has("--strict");
  let worstExit = 0;
  const results: Record<string, Result> = {};
  for (const file of files) {
    const res = validateFile(file);
    results[file] = res;
    if (res.errors.length > 0 || (strict && res.warnings.length > 0)) worstExit = 1;
    if (!asJson && !quiet) printHuman(file, res, io);
  }
  if (asJson) io.log(JSON.stringify(results, null, 2));
  return worstExit;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(runCli(process.argv.slice(2)));
}
