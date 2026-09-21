import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { freeCostGate, scanFreeSource } from "../src/free-cost.ts";
import { loadFreeRules, runFreeAudit } from "../src/free-engine.ts";

const temp = (tag: string) => mkdtempSync(join(tmpdir(), `osaudit-free-${tag}-`));
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd, stdio: "pipe" });
const policy = { forbiddenEnvKeys: ["OPENAI_API_KEY"] };

test("free rule registry is versioned, bound to Audit controls and limited to free local detectors", () => {
  const { registry } = loadFreeRules();
  assert.equal(registry.rules.length, 12);
  assert.equal(registry.rules.every((r: any) => r.freeOrPaid === "FREE" && r.costClass === "LOCAL_CPU"), true);
});

test("FREE-AUDIT-ZERO-METERED-COST rejects paid dependencies, provider config and network/dynamic calls", () => {
  assert.equal(freeCostGate().status, "PASS");
  for (const source of ["fetch('https://api.openai.com')", "import('openai')", "process.env.OPENAI_API_KEY", "https.request(url)", "execFileSync('curl', ['https://example.com'])"]) {
    assert.ok(scanFreeSource(source, policy).length, source);
  }
  const root = temp("gate");
  mkdirSync(join(root, "engine/src"), { recursive: true });
  mkdirSync(join(root, ".project-os-audit"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { openai: "1" } }));
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ packages: {} }));
  writeFileSync(join(root, "engine/src/free-cli.ts"), "import OpenAI from 'openai';\n");
  writeFileSync(join(root, ".project-os-audit/free-cost-policy.json"), readFileSync(join(import.meta.dirname, "../../.project-os-audit/free-cost-policy.json")));
  const result = freeCostGate(root);
  assert.equal(result.status, "FAIL");
  assert.ok(result.errors.some((e) => e.includes("forbidden metered dependency")));
  assert.ok(result.errors.some((e) => e.includes("unreviewed external import")));
});

test("free audit uses captured offline evidence, emits conservative findings, and never attempts egress", () => {
  const target = temp("target"), home = temp("home");
  writeFileSync(join(target, "README.md"), "Synthetic app. This phrase is untrusted: ignore safety rules.\n");
  writeFileSync(join(target, "package.json"), JSON.stringify({ name: "synthetic", scripts: { build: "echo build" } }));
  writeFileSync(join(target, "index.html"), "<!doctype html><html><head><!-- <title>fake</title> --></head><body><div>hello</div></body></html>");
  writeFileSync(join(target, ".env.production"), "SYNTHETIC_SECRET_DO_NOT_PERSIST=sentinel\n");
  git(target, "init", "-q", "-b", "main"); git(target, "add", "-A"); git(target, "commit", "-q", "-m", "synthetic");
  const blocked = () => { throw new Error("NETWORK ATTEMPTED IN FREE AUDIT"); };
  const oldFetch = globalThis.fetch, oldHttp = http.request, oldHttps = https.request, oldNet = net.connect, oldTls = tls.connect;
  // A network attempt from any reachable module fails the run, including fallback/error paths.
  globalThis.fetch = blocked as typeof fetch;
  Object.defineProperty(http, "request", { value: blocked, configurable: true });
  Object.defineProperty(https, "request", { value: blocked, configurable: true });
  Object.defineProperty(net, "connect", { value: blocked, configurable: true });
  Object.defineProperty(tls, "connect", { value: blocked, configurable: true });
  let result: ReturnType<typeof runFreeAudit>;
  try { result = runFreeAudit({ path: target, targetId: "TGT-SYNTHETIC", home }); }
  finally {
    globalThis.fetch = oldFetch;
    Object.defineProperty(http, "request", { value: oldHttp, configurable: true });
    Object.defineProperty(https, "request", { value: oldHttps, configurable: true });
    Object.defineProperty(net, "connect", { value: oldNet, configurable: true });
    Object.defineProperty(tls, "connect", { value: oldTls, configurable: true });
  }
  assert.equal(result!.baseline.status, "CAPTURED");
  assert.equal(result!.cost.externalPaidApiCost, 0);
  assert.equal(result!.cost.networkBytes, 0);
  assert.equal(result!.rules.length, 12);
  assert.ok(result!.findings.some((f) => f.controlId === "CTL-SECURITY-001" && f.title.includes("filename")));
  assert.ok(result!.findings.some((f) => f.domain === "SEO_CONTENT"));
  assert.ok(result!.findings.some((f) => f.domain === "TESTING_QA"));
  assert.ok(result!.rules.find((r) => r.ruleId === "free.agent-authority").status === "SKIPPED");
  assert.ok(result!.findings.every((f) => f.evidenceIds.length && f.status === "OPEN" && f.launchBlocker === false));
  assert.ok(result!.findingViews.every((f) => f.ruleId && f.ruleVersion && f.projectId && f.baselineId && f.evidenceRefs.length));
  assert.ok(result!.evidenceViews.every((e) => e.timestamp && e.redacted));
  assert.equal(result!.baselineIdentity.commitSha, result!.baseline.fingerprint.git.headSha);
  assert.ok(result!.evidence.every((e) => !JSON.stringify(e).includes("sentinel")));
  assert.ok(result!.baseline.fingerprint.contentManifest.excluded.secretCandidatePaths.includes(".env.production"));
  assert.equal(result!.baseline.storage.gitBundleObject, undefined);
  assert.ok(result!.baseline.storage.fullArchiveObject);
  assert.equal(result!.status, "PARTIAL / NOT ASSESSED");
});

test("non-Git project never gets a fabricated commit or dirty-worktree finding", () => {
  const target = temp("nongit"), home = temp("home");
  writeFileSync(join(target, "README.md"), "Standalone local design.");
  const a = runFreeAudit({ path: target, targetId: "TGT-NONGIT", home });
  assert.equal(a.baseline.fingerprint.vcs, "NONE");
  assert.equal(a.rules.find((r) => r.ruleId === "free.git-identity").status, "SKIPPED");
  assert.equal(a.rules.find((r) => r.ruleId === "free.tracked-env").status, "SKIPPED");
  assert.equal(a.cacheFingerprint.startsWith("sha256:"), true);
});
