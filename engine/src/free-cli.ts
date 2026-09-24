#!/usr/bin/env node
// Offline free audit. No target write, no paid APIs.
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { parseArgs } from "node:util";
import { freeCostGate } from "./free-cost.ts";
import { runFreeAudit } from "./free-engine.ts";
import { writeOnceJson } from "./store.ts";
import { summarizeFreeAudit } from "./free-summary.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: "string" },
    home: { type: "string" },
    out: { type: "string" },
    summary: { type: "string" },
    "check-cost": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(`1stStep OS Audit — free offline audit (zero metered cost)

Usage:
  npm run audit:free -- <path> --target TGT-ID --home <store> --out <result.json>
  npm run check:free-cost
  node engine/src/free-cli.ts --help

Options:
  --target       Target id
  --home         Audit home outside the target
  --out          Result JSON outside the target
  --summary      Optional compact review JSON outside the target; read this first to reduce context
  --check-cost   Run free-cost gate only
  -h, --help     Show help

Never writes into the target. Never calls paid APIs.
`);
  process.exit(0);
}

const gate = freeCostGate();
if (gate.status !== "PASS") throw new Error(`${gate.gate} FAIL: ${gate.errors.join("; ")}`);
if (values["check-cost"]) {
  console.log(`${gate.gate}: PASS (${gate.checkedFiles.length} reachable modules; no metered dependency/egress)`);
  process.exit(0);
}
if (!positionals[0] || !values.target || !values.home || !values.out) {
  throw new Error("usage: node engine/src/free-cli.ts <path> --target TGT-ID --home <store> --out <result.json>  (or --help)");
}
const root = realpathSync(resolve(positionals[0]));
const outputPath = (path: string) => {
  let parent = resolve(path);
  const suffix: string[] = [];
  while (!existsSync(parent)) { suffix.unshift(relative(dirname(parent), parent)); parent = dirname(parent); }
  const resolved = resolve(realpathSync(parent), ...suffix);
  const rel = relative(root, resolved);
  if (!rel || (!rel.startsWith("..\\") && !rel.startsWith("../") && rel !== ".." && !isAbsolute(rel))) throw new Error("result must be written outside target");
  if (existsSync(resolved)) throw new Error("refusing to overwrite immutable record");
  return resolved;
};
const out = outputPath(values.out), summary = values.summary ? outputPath(values.summary) : null;
if (summary && relative(out, summary) === "") throw new Error("summary and full report need distinct paths");
const result = runFreeAudit({ path: positionals[0], targetId: values.target, home: values.home });
writeOnceJson(out, result);
if (summary) writeOnceJson(summary, summarizeFreeAudit(result, out));
console.log(`${result.status} · ${result.baseline.fingerprint.contentManifest.fileCount} files · ${result.findings.length} provisional findings · ${result.rules.filter((r) => r.status === "SKIPPED").length} skipped · ${result.cost.externalPaidApiCost} external paid API cost · ${out}`);
if (summary) console.log(`Compact review: ${summary} (full evidence retained in ${out})`);
