import { readdirSync } from "node:fs";
import { join } from "node:path";
import { validateFile } from "../dist/index.js";

const root = new URL("../../../shared/conformance/", import.meta.url).pathname;

for (const sub of ["valid", "invalid"]) {
  const dir = join(root, sub);
  for (const f of readdirSync(dir)) {
    const res = validateFile(join(dir, f));
    console.log(`${sub}/${f}\t${res.valid}\t${res.errors.map((e) => e.code).join(",")}\t[warn:${res.warnings.map((e)=>e.code).join(",")}]`);
  }
}
