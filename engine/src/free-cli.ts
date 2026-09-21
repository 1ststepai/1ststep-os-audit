#!/usr/bin/env node
// Offline free audit. No target write, no paid APIs.
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { freeCostGate } from "./free-cost.ts";
import { runFreeAudit } from "./free-engine.ts";
import { writeOnceJson } from "./store.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: "string" },
    home: { type: "string" },
    out: { type: "string" },
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
const out = resolve(values.out), root = resolve(positionals[0]);
if (out === root || out.startsWith(root + "\\") || out.startsWith(root + "/")) {
  throw new Error("result must be written outside target");
}
const result = runFreeAudit({ path: positionals[0], targetId: values.target, home: values.home });
writeOnceJson(out, result);
console.log(`${result.status} · ${result.baseline.fingerprint.contentManifest.fileCount} files · ${result.findings.length} provisional findings · ${result.rules.filter((r) => r.status === "SKIPPED").length} skipped · ${result.cost.externalPaidApiCost} external paid API cost · ${out}`);
