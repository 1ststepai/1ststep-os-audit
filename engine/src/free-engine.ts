// Provisional, offline first-look lane. Reuses canonical Audit snapshot/evidence/finding contracts; never scores or finalizes.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cpuUsage, memoryUsage } from "node:process";
import { performance } from "node:perf_hooks";
import { capture, type FileEntry } from "./capture.ts";
import { loadContracts, REPO_ROOT } from "./contracts.ts";
import { discover } from "./discover.ts";
import { findingFingerprint } from "./lifecycle.ts";
import { getObject, putObject } from "./store.ts";
import { type Json, loadJson, nowIso, shaJson } from "./util.ts";

export const FREE_ENGINE_VERSION = "0.1.0";
const TEMPLATE_SUFFIX: Record<string, string> = {
  AGENT_FILE: "B", DECISION_FILE: "C", RELEASE_FILE: "B", TEST_SCRIPT: "B", TRACKED_ENV: "B",
  HTML_TITLE: "B", HTML_CANONICAL: "C", HTML_LANG: "B", HTML_MAIN: "C",
};
const SEVERITY: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };
const PATHS: Record<string, RegExp> = {
  AGENT_FILE: /^(AGENTS|CLAUDE)\.md$/i,
  DECISION_FILE: /^(DECISIONS\.md|docs\/architecture\/decision-log\.md|architecture\/decisions\/[^/]+\.md)$/i,
  RELEASE_FILE: /^(RELEASE\.md|docs\/[^/]*release[^/]*\.md|docs\/production-readiness\/RELEASE_EXECUTION_PLAN\.md|gates\/[^/]*release[^/]*\.md)$/i,
  CI_WORKFLOW: /^(\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.yml|bitbucket-pipelines\.yml)$/i,
};
const RULES_PATH = resolve(REPO_ROOT, ".project-os-audit/free-rules.json");
const RULE_FIELDS = ["id", "version", "domain", "controlId", "title", "description", "applicability", "detector", "evidenceRequirements", "severityLogic", "confidenceLogic", "remediationClass", "freeOrPaid", "costClass", "falsePositiveRisk", "reviewStatus", "provenance"];

export function loadFreeRules(path = RULES_PATH) {
  const C = loadContracts();
  if (C.errors.length) throw new Error(`Audit contracts invalid: ${C.errors.join("; ")}`);
  const registry = loadJson(path);
  if (!/^\d+\.\d+\.\d+$/.test(registry.ruleSetVersion) || !Array.isArray(registry.rules) || registry.rules.length < 10 || registry.rules.length > 20) throw new Error("free rule registry must be versioned and contain 10–20 rules");
  const seen = new Set<string>(), templates = new Set<string>();
  for (const r of registry.rules) {
    for (const f of RULE_FIELDS) if (typeof r[f] !== "string" || !r[f]) throw new Error(`${r.id}: missing ${f}`);
    if (Object.keys(r).sort().join() !== [...RULE_FIELDS].sort().join()) throw new Error(`${r.id}: unexpected/missing rule field`);
    if (seen.has(r.id) || !/^free\.[a-z0-9-]+$/.test(r.id)) throw new Error(`duplicate/invalid free rule ${r.id}`);
    seen.add(r.id);
    if (r.version !== registry.ruleSetVersion || r.freeOrPaid !== "FREE" || r.costClass !== "LOCAL_CPU" || r.reviewStatus !== "PROVISIONAL_DOGFOOD") throw new Error(`${r.id}: unapproved version/cost/review state`);
    if (!C.controls.has(r.controlId) || C.controls.get(r.controlId).domain !== r.domain) throw new Error(`${r.id}: unknown/mismatched Audit control`);
    if (!(["GIT_IDENTITY", "DIRTY_OVERLAY", "AGENT_FILE", "DECISION_FILE", "RELEASE_FILE", "TEST_SCRIPT", "CI_WORKFLOW", "TRACKED_ENV", "HTML_TITLE", "HTML_CANONICAL", "HTML_LANG", "HTML_MAIN"] as string[]).includes(r.detector)) throw new Error(`${r.id}: unknown detector`);
    if (TEMPLATE_SUFFIX[r.detector]) {
      const template = `FT-${r.controlId.slice(4)}-${TEMPLATE_SUFFIX[r.detector]}`;
      if (templates.has(template)) throw new Error(`${r.id}: duplicate template ${template}`);
      templates.add(template);
    }
  }
  return { C, registry };
}

function trackedSensitive(root: string): string[] {
  const paths = execFileSync("git", ["-C", root, "ls-files", "-z", "--cached"], { env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" }, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").split("\0");
  return paths.filter((p) => /(^|\/)(\.env($|\.(?!example$|sample$|template$))|[^/]*\.(pem|key|p12|pfx|jks|keystore)$|id_(rsa|dsa|ecdsa|ed25519)$|credentials(\.json)?$|secrets?\.(json|ya?ml|toml)$)/i.test(p)).sort();
}

export function runFreeAudit(input: { path: string; targetId: string; home: string }) {
  const { C, registry } = loadFreeRules();
  if (!/^TGT-[A-Z0-9-]{2,48}$/.test(input.targetId)) throw new Error("invalid target ID");
  const root = resolve(input.path), home = resolve(input.home);
  const started = performance.now(), cpuStart = cpuUsage(), at = nowIso();
  // Read-only index paths before/after capture; a changing index cannot support a tracked-file assertion.
  const preTracked = (() => { try { return trackedSensitive(root); } catch { return null; } })();
  // A Git bundle can contain historical secrets even when current .env files are excluded.
  // This lane stores only the filtered working-tree snapshot, never repository history.
  const cap = capture(root, home, { omitGitHistory: true });
  if (cap.invalidated) throw new Error("target changed during capture; snapshot invalidated");
  const postTracked = cap.fingerprint.vcs === "GIT" ? trackedSensitive(root) : null;
  if (cap.fingerprint.vcs === "GIT" && JSON.stringify(preTracked) !== JSON.stringify(postTracked)) throw new Error("Git index changed during capture");
  const d = discover(cap.entries, (h) => getObject(home, h), { runId: "RUN-0001", snapshotId: "SNAP-0001", runSeq: "0001", at });
  const commands: Json[] = cap.fingerprint.vcs === "GIT" ? [{ id: "CMD-001", purpose: "OTHER", command: "git rev-parse/status/ls-files (read-only local metadata)", isolation: "LOCAL_READ_ONLY", status: "PASSED", outputObject: putObject(home, JSON.stringify({ trackedSensitivePaths: postTracked })) }] : [];
  const baseline: Json = {
    kind: "BaselineSnapshot", schemaVersion: "0.1.0", id: "SNAP-0001", targetId: input.targetId, role: "BASELINE", status: "CAPTURED", capturedAt: at,
    capturedBy: { actorType: "SYSTEM", actorId: "osaudit.free" }, captureTool: { name: "osaudit-free", version: FREE_ENGINE_VERSION },
    fingerprint: cap.fingerprint, storage: cap.storage, inventory: d.inventory, commands, externalEvidenceIds: [],
  };
  const validate = (title: string, v: Json) => { const errors = C.validate(title, v); if (errors.length) throw new Error(`${title}: ${errors.join("; ")}`); };
  validate("BaselineSnapshot", baseline);
  const entries = new Map(cap.entries.map((e) => [e.path, e]));
  const evidence: Json[] = d.evidence.slice(), findings: Json[] = [], results: Json[] = [];
  const addEvidence = (r: Json, claim: string, file: FileEntry | undefined, absence = false, coverage: string[] = []) => {
    if (!file && cap.fingerprint.vcs !== "GIT") return null;
    const id = `EV-0001-${String(evidence.length + 1).padStart(4, "0")}`;
    const git = !file;
    const e: Json = {
      kind: "EvidenceItem", schemaVersion: "0.1.0", id, runId: "RUN-0001", snapshotId: "SNAP-0001", claim,
      sourceKind: git ? "GIT_METADATA" : file.path.endsWith(".md") ? "DOCUMENTATION" : file.path === "package.json" ? "DEPENDENCY_MANIFEST" : "SOURCE_CODE",
      strength: git ? "E4" : file.path.endsWith(".md") ? "E2" : "E3", state: git ? "CONFIRMED" : "OBSERVED", polarity: absence ? "ABSENCE" : "SUPPORTS", collectedAt: at,
      collector: { actorType: "SYSTEM", actorId: r.id }, scope: { controlIds: [r.controlId] },
      locator: git ? { type: "COMMAND", commandId: "CMD-001", outputObject: commands[0].outputObject } : { type: "REPOSITORY", path: file.path, contentHash: file.hash },
      ...(absence ? { searchCoverage: { patterns: [r.detector], pathsSearched: coverage.length ? coverage : [file!.path], filesSearched: coverage.length || 1 } } : {}),
    };
    validate("EvidenceItem", e); evidence.push(e); return id;
  };
  const addFinding = (r: Json, evidenceId: string, severity: string, surface: { type: string; ref: string }, explanation: string) => {
    const templateId = `FT-${r.controlId.slice(4)}-${TEMPLATE_SUFFIX[r.detector]}`;
    const surfaces = [surface], fingerprint = findingFingerprint(r.controlId, templateId, surfaces);
    const id = `AUD-${BigInt("0x" + fingerprint.slice(7, 19)).toString(10)}`;
    const f: Json = { kind: "Finding", schemaVersion: "0.1.0", id, targetId: input.targetId, fingerprint, title: r.title, domain: r.domain,
      controlId: r.controlId, templateId, severity, status: "OPEN", evidenceState: evidence.find((e) => e.id === evidenceId).state,
      evidenceStrength: evidence.find((e) => e.id === evidenceId).strength, evidenceIds: [evidenceId], impact: explanation,
      affectedSurfaces: surfaces, recommendation: `Review ${r.remediationClass} for the cited scope; verify before treating this as a production issue.`,
      verificationRequired: { method: "CODE_REVIEW", minStrength: "E3", description: "Recheck the named source scope on a new baseline." },
      owner: null, dependencies: [], launchBlocker: false, introducedInAudit: "RUN-0001", introducedInSnapshot: "SNAP-0001", lastUpdated: at,
      verifiedAt: null, verificationEvidence: [], verificationRecordIds: [], history: [{ seq: 1, at, from: null, to: "OPEN", actor: { actorType: "SYSTEM", actorId: "osaudit.free" }, reason: `Rule ${r.id}@${r.version}: ${explanation}`, runId: "RUN-0001", evidenceIds: [evidenceId] }],
    };
    validate("Finding", f); findings.push(f); return id;
  };

  for (const r of registry.rules) {
    const result: Json = { ruleId: r.id, version: r.version, status: "SKIPPED", evidenceIds: [], findingIds: [], reason: "Not applicable to the captured source." };
    const record = (id: string | null, reason: string) => { if (id) { result.evidenceIds.push(id); result.status = "OBSERVED"; } result.reason = reason; };
    const missing = (file: FileEntry | undefined, scope: string[], severity: string, explanation: string, surface: { type: string; ref: string }) => {
      if (!file) return;
      const id = addEvidence(r, explanation, file, true, scope);
      if (id) { result.evidenceIds.push(id); result.findingIds.push(addFinding(r, id, severity, surface, explanation)); result.status = "FINDING"; result.reason = explanation; }
    };
    if (r.detector === "GIT_IDENTITY") {
      if (cap.fingerprint.vcs === "GIT") record(addEvidence(r, `Captured Git branch and commit for ${input.targetId}; no live deployment inferred.`, undefined), "Git identity captured.");
      else result.reason = "Non-Git/unborn source: manifest identity is WEAK; no commit claimed.";
    } else if (r.detector === "DIRTY_OVERLAY") {
      if (cap.fingerprint.vcs === "GIT") record(addEvidence(r, `Dirty overlay: ${cap.fingerprint.dirty.isDirty}; counts from captured Git status.`, undefined), "Dirty state is context, not a defect.");
    } else if (r.detector === "TRACKED_ENV") {
      if (cap.fingerprint.vcs === "GIT") {
        if (postTracked!.length) for (const p of postTracked!) {
          const id = addEvidence(r, `Git tracks sensitive-configuration filename ${p}; contents and validity were not examined.`, undefined);
          if (id) { result.evidenceIds.push(id); result.findingIds.push(addFinding(r, id, "HIGH", { type: "FILE", ref: p }, "A sensitive-configuration filename is tracked; whether it contains a live secret is UNKNOWN.")); result.status = "FINDING"; }
        } else record(addEvidence(r, "No tracked sensitive-configuration filenames matched this bounded path check; no secret scan ran.", undefined), "Path check only; secret contents/history not assessed.");
      }
    } else if (r.detector in PATHS) {
      const hits = cap.entries.filter((e) => PATHS[r.detector].test(e.path));
      if (hits.length) record(addEvidence(r, `Captured file ${hits[0].path} matches ${r.title}; contents/quality not verified.`, hits[0]), "Conventional file observed; quality not assessed.");
      else result.reason = `No conventional ${r.title.toLowerCase()} path; external/parent governance UNKNOWN, no finding.`;
    } else if (r.detector === "TEST_SCRIPT") {
      const pkg = entries.get("package.json");
      if (pkg && pkg.size < 1 << 20) {
        let json: Json; try { json = JSON.parse(getObject(home, pkg.hash).toString("utf8")); } catch { result.reason = "Invalid root package.json; test-script status UNKNOWN."; results.push(result); continue; }
        if (Object.entries(json.scripts ?? {}).some(([key, value]) => /^test(?::|$)/.test(key) && typeof value === "string" && value.trim() && !/^echo\b.*no test/i.test(value))) record(addEvidence(r, "Root package.json declares a test or test:* script; execution not assessed.", pkg), "Test script declared, not run.");
        else missing(pkg, [pkg.path], "LOW", "Root package.json has no substantive test script; other workspace/package tests UNKNOWN.", { type: "FILE", ref: pkg.path });
      }
    } else if (r.detector.startsWith("HTML_")) {
      const html = entries.get("index.html");
      if (html && html.size < 1 << 20) {
        const source = getObject(home, html.hash).toString("utf8").replace(/<!--[\s\S]*?-->/g, "");
        const checks: Record<string, boolean> = {
          HTML_TITLE: /<title\b[^>]*>\s*[^\s<][^<]*<\/title\s*>/i.test(source),
          HTML_CANONICAL: /<link\b(?=[^>]*\brel\s*=\s*["']?canonical\b)[^>]*>/i.test(source),
          HTML_LANG: /<html\b[^>]*\blang\s*=\s*["']?[a-z]{2,}/i.test(source),
          HTML_MAIN: /<main\b|\brole\s*=\s*["']main["']/i.test(source),
        };
        if (checks[r.detector]) record(addEvidence(r, `Static root index.html contains ${r.title.toLowerCase()}; rendered/live state not assessed.`, html), "Static source field observed.");
        else missing(html, [html.path], r.detector === "HTML_TITLE" || r.detector === "HTML_LANG" ? "LOW" : "INFO", `Static root index.html lacks ${r.title.toLowerCase()}; dynamic rendering remains UNKNOWN.`, { type: "FILE", ref: html.path });
      }
    }
    results.push(result);
  }

  const ids = new Set(findings.map((f) => f.id));
  if (ids.size !== findings.length) throw new Error("finding ID collision");
  const priorities = [...findings].sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity] || a.id.localeCompare(b.id)).map((f) => ({ findingId: f.id, priority: f.severity === "HIGH" ? "HIGH" : f.severity === "LOW" ? "LOW" : "INFO", why: `${f.severity} per ${results.find((r) => r.findingIds.includes(f.id)).ruleId}; source-only scope and evidence ${f.evidenceIds[0]}.` }));
  const capabilityNames: Record<string, string> = { SECURITY: "Security Auditor", DEPLOYMENT: "Independent Audit Agent", DOCUMENTATION_OS: "Lead Engineer / Orchestrator", ACCESSIBILITY: "Accessibility Agent", SEO_CONTENT: "Discovery Agent", PERFORMANCE: "Performance Agent", TESTING_QA: "Independent Audit Agent" };
  const recommendations = [...new Set(findings.map((f) => f.controlId))].map((id) => ({ capability: capabilityNames[C.controls.get(id).domain] ?? "Lead Engineer / Orchestrator", capabilityId: C.controls.get(id).capabilityRefs[0], findingIds: findings.filter((f) => f.controlId === id).map((f) => f.id), why: `Existing Audit control ${id} is linked to these evidence-backed source findings; optional capability, not an upsell.` }));
  const findingViews = findings.map((f) => {
    const r = registry.rules.find((r: Json) => r.id === results.find((x) => x.findingIds.includes(f.id)).ruleId);
    return { findingId: f.id, projectId: input.targetId, baselineId: baseline.id, ruleId: r.id, ruleVersion: r.version, domain: f.domain,
      severity: f.severity, confidence: r.confidenceLogic.startsWith("HIGH") ? "HIGH" : r.confidenceLogic.startsWith("MEDIUM") ? "MEDIUM" : "UNKNOWN",
      confidenceBasis: r.confidenceLogic, title: f.title, explanation: f.impact, whyItMatters: r.description,
      evidenceRefs: f.evidenceIds, remediationClass: r.remediationClass, status: f.status, createdAt: at };
  });
  const evidenceViews = evidence.map((e) => ({ evidenceId: e.id, kind: e.sourceKind, path: e.locator?.path ?? null,
    lineStart: e.locator?.lineStart ?? null, lineEnd: e.locator?.lineEnd ?? null, configKey: null, commandId: e.locator?.commandId ?? null,
    repositoryMetadata: e.sourceKind === "GIT_METADATA" ? { commandId: e.locator?.commandId } : null, testResult: null,
    ruleOutput: e.collector.actorId, timestamp: e.collectedAt, redacted: true }));
  const cpu = cpuUsage(cpuStart), durationMs = Math.round(performance.now() - started);
  const cost = { filesProcessed: cap.fingerprint.contentManifest.fileCount, bytesProcessed: cap.fingerprint.contentManifest.totalBytes, runtimeMs: durationMs,
    peakMemoryBytes: memoryUsage().rss, cpuDurationMs: Math.round((cpu.user + cpu.system) / 1000), storageUsedBytes: null, networkBytes: 0,
    cacheHits: 0, cacheMisses: 1, externalPaidApiCost: 0, currency: "USD", instrumentation: "No network path; resource accounting is local process-level estimate; storage bytes not yet instrumented." };
  const fingerprint = shaJson({ projectId: input.targetId, repositoryIdentity: cap.fingerprint.git?.normalizedRemote ?? root,
    commitSha: cap.fingerprint.git?.headSha ?? null, branch: cap.fingerprint.git?.branch ?? null, contentManifest: cap.fingerprint.contentManifest.manifestHash,
    engineVersion: FREE_ENGINE_VERSION, ruleSetVersion: registry.ruleSetVersion, rules: registry.rules.map((r: Json) => `${r.id}@${r.version}`), upstreamLock: C.versions.upstreamLockHash, scope: "LOCAL_OFFLINE", authorization: input.targetId });
  const baselineIdentity = { projectId: input.targetId, repositoryIdentity: cap.fingerprint.git?.normalizedRemote ?? root,
    branch: cap.fingerprint.git?.branch ?? null, commitSha: cap.fingerprint.git?.headSha ?? null, capturedAt: at,
    auditEngineVersion: FREE_ENGINE_VERSION, ruleSetVersion: registry.ruleSetVersion, baselineId: baseline.id,
    identityStrength: cap.fingerprint.vcs === "GIT" ? "LOCAL_GIT" : "WEAK_NON_GIT" };
  return { status: "PARTIAL / NOT ASSESSED", targetId: input.targetId, sourcePath: root, baseline, baselineIdentity, ruleSetVersion: registry.ruleSetVersion,
    rules: results, evidence, evidenceViews, findings, findingViews, priorities, recommendations, cost, cacheFingerprint: fingerprint,
    zeroCostGate: "PASS_STATIC_POLICY_AND_OFFLINE_EXECUTION", limitations: ["Not a finalized AuditRun or customer report.", "Static source only; no runtime, provider, private repository or business-quality claims.", "No paid API path; infrastructure is not free."] };
}
