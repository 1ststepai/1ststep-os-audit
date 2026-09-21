#!/usr/bin/env node
// osaudit â€” local CLI over a local audit home (default ~/.osaudit). Never writes into a target.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { capture } from "./capture.ts";
import { loadContracts } from "./contracts.ts";
import { discover } from "./discover.ts";
import { findingFingerprint } from "./lifecycle.ts";
import { renderReport } from "./report.ts";
import { deriveProjectTypes, launchBlockerApplies, matchedTypes, scoreRun, SEVERITY, STRENGTH } from "./scoring.ts";
import { appendLedger, getObject, verifyLedger, writeOnceJson } from "./store.ts";
import { type Json, canonical, loadJson, nowIso, sha256, shaJson } from "./util.ts";

const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    home: { type: "string", default: join(homedir(), ".osaudit") }, target: { type: "string" }, name: { type: "string" },
    profile: { type: "string" }, modes: { type: "string", default: "SNAPSHOT" }, domains: { type: "string" }, by: { type: "string", default: "user.owner" },
    update: { type: "boolean", default: false }, help: { type: "boolean", short: "h", default: false },
  },
});
const [cmd, arg] = positionals;
if (o.help || cmd === "help" || cmd === undefined) {
  console.log(`osaudit — 1stStep OS Audit local CLI

Commands:
  validate | lock [--update] | init <path> --target ID --name NAME
  confirm | baseline | score | report | finalize
  help

Global:
  --home ~/.osaudit   --target TGT-ID   --by user.owner
  -h, --help

Never writes into the target project tree.
`);
  process.exit(0);
}
const die = (msg: string): never => { console.error(`osaudit: ${msg}`); process.exit(1); };
const C = loadContracts();
const tdir = () => join(o.home!, "targets", o.target ?? die("--target TGT-â€¦ required"));
const readJ = (p: string) => (existsSync(p) ? loadJson(p) : die(`missing ${p}`));
const saveDraft = (p: string, v: Json) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 2) + "\n"); };
const check = (title: string, obj: Json) => { const e = C.validate(title, obj); if (e.length) die(`${title} invalid:\n  ${e.join("\n  ")}`); };
const user = () => ({ actorType: "USER", actorId: o.by! });

function blockOnContracts() { if (C.errors.length) die(`contracts invalid:\n  ${C.errors.join("\n  ")}`); }

const commands: Record<string, () => void> = {
  validate() {
    console.log(C.errors.length ? `FAIL\n  ${C.errors.join("\n  ")}` : `PASS Â· ${C.controls.size} controls Â· ${C.profiles.size} project types`);
    if (C.errors.length) process.exit(1);
  },

  lock() {
    // Deliberate upstream re-pin after reviewing upstream changes.
    const lockPath = join(C.root, ".project-os-audit/upstream-lock.json");
    const lock = loadJson(lockPath);
    const up = resolve(C.root, lock.localPath);
    const files = [...readdirSync(join(up, "schemas/0.1.0")).filter((f) => f.endsWith(".json")).sort().map((f) => `schemas/0.1.0/${f}`), ".project-os/capability-taxonomy.json"];
    if (!o.update) return commands.validate();
    lock.files = Object.fromEntries(files.map((f) => [f, sha256(readFileSync(join(up, f)))]));
    lock.capturedAt = nowIso();
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
    console.log(`re-pinned ${files.length} upstream files; run osaudit validate`);
  },

  init() {
    blockOnContracts();
    const path = resolve(arg ?? die("usage: osaudit init <path> --target TGT-ID --name NAME"));
    const dir = tdir();
    if (existsSync(join(dir, "target.json"))) die("target already exists");
    const unknown = { status: "UNKNOWN" };
    const target = {
      kind: "AuditTarget", schemaVersion: "0.1.0", id: o.target, name: o.name ?? basename(path), createdAt: nowIso(),
      source: { type: "LOCAL_PATH", localPath: path, vcs: existsSync(join(path, ".git")) ? "GIT" : "NONE" },
      identity: { strength: "WEAK", firstManifestHash: "sha256:" + "0".repeat(64) },
      profile: { productTypes: unknown, platformTargets: unknown, dataSensitivity: unknown, auth: { needed: unknown, methods: unknown, multiTenant: unknown },
        payments: { needed: unknown, handlesCardData: unknown }, ai: { usesAI: unknown, userDataSentToModels: unknown, autonomousExternalActions: unknown },
        businessModel: unknown, integrations: unknown, auditProjectTypes: unknown, confirmation: { status: "UNCONFIRMED" } },
      environments: [], externalSystems: [],
    };
    check("AuditTarget", target);
    saveDraft(join(dir, "target.json"), target);
    console.log(`initialized ${o.target} at ${dir}. Next: osaudit baseline, then osaudit confirm --profile <file> (audit:G0).`);
  },

  confirm() {
    // audit:G0 â€” owner-confirmed profile; project types derived deterministically.
    const p = join(tdir(), "target.json");
    const target = readJ(p);
    const profile = { ...target.profile, ...readJ(o.profile ?? die("--profile <file> required")) };
    const types = deriveProjectTypes(C, profile);
    if (!types.length) die("profile derives no audit project type; add productTypes/platformTargets");
    profile.auditProjectTypes = { status: "KNOWN", value: types, evidence: "CONFIRMED", source: "RULE_DERIVED" };
    profile.confirmation = { status: "CONFIRMED", confirmedBy: user(), confirmedAt: nowIso() };
    const next = { ...target, profile };
    check("AuditTarget", next);
    saveDraft(p, next);
    console.log(`audit:G0 profile confirmed Â· project types ${types.join(", ")}`);
  },

  baseline() {
    blockOnContracts();
    const dir = tdir();
    const target = readJ(join(dir, "target.json"));
    if (existsSync(join(dir, "runs/RUN-0001"))) die("baseline run already exists; baselines are immutable (use a new target or re-audit)");
    const home = join(dir);
    const at = nowIso();
    const cap = capture(target.source.localPath, home);
    const snapshotId = "SNAP-0001", runId = "RUN-0001";
    const d = discover(cap.entries, (h) => getObject(home, h), { runId, snapshotId, runSeq: "0001", at });
    const identity = cap.fingerprint.git
      ? { strength: cap.fingerprint.git.rootCommits.length ? "STRONG" : "MODERATE", gitRootCommits: cap.fingerprint.git.rootCommits, ...(cap.fingerprint.git.normalizedRemote ? { normalizedRemote: cap.fingerprint.git.normalizedRemote } : {}) }
      : { strength: "WEAK", firstManifestHash: cap.fingerprint.contentManifest.manifestHash };
    const nextTarget = { ...target, identity, source: { ...target.source, vcs: cap.fingerprint.vcs } };
    check("AuditTarget", nextTarget);
    saveDraft(join(dir, "target.json"), nextTarget);

    const snapshot = {
      kind: "BaselineSnapshot", schemaVersion: "0.1.0", id: snapshotId, targetId: target.id, role: "BASELINE", status: cap.invalidated ? "INVALIDATED" : "CAPTURED",
      capturedAt: at, capturedBy: { actorType: "SYSTEM", actorId: "osaudit.capture" }, captureTool: { name: "osaudit", version: "0.1.0" },
      fingerprint: cap.fingerprint, storage: cap.storage, inventory: d.inventory, commands: [], externalEvidenceIds: [],
    };
    check("BaselineSnapshot", snapshot);
    for (const e of d.evidence) check("EvidenceItem", e);
    const domains = o.domains ? o.domains.split(",") : C.domains;
    const run = {
      kind: "AuditRun", schemaVersion: "0.1.0", id: runId, targetId: target.id, runType: "BASELINE", modes: o.modes!.split(","),
      snapshotId, baselineId: snapshotId,
      scope: { domains, excludedDomains: C.domains.filter((x) => !domains.includes(x)).map((x) => ({ domain: x, reason: "Out of scope for this run." })), versions: C.versions },
      agents: [], stages: [{ name: "SNAPSHOT", status: cap.invalidated ? "BLOCKED" : "DONE" }, { name: "DISCOVER", status: "DONE" }],
      gates: [{ gate: "G2", result: cap.invalidated ? "BLOCKED" : "PASS", evaluatedAt: at, evidence: `Manifest ${cap.fingerprint.contentManifest.manifestHash}; stable=${!cap.invalidated}.` }],
      status: cap.invalidated ? "BLOCKED" : "RUNNING", startedAt: at, blockers: cap.invalidated ? [{ code: "UNSTABLE_CAPTURE", description: cap.notes.join(" ") }] : [],
    };
    check("AuditRun", run);
    const rdir = join(dir, "runs", runId);
    writeOnceJson(join(rdir, "snapshot.captured.json"), snapshot);
    appendLedger(home, { objectKind: "BaselineSnapshot", objectId: snapshotId, objectHash: shaJson(snapshot), at });
    writeOnceJson(join(rdir, "evidence.discovery.json"), d.evidence);
    saveDraft(join(rdir, "run.json"), run);
    saveDraft(join(rdir, "notes.json"), cap.notes);
    saveDraft(join(rdir, "profile.draft.json"), d.profileDraft);
    // Assessment worksheet: every in-scope control starts UNVERIFIED with no evidence (honest default).
    saveDraft(join(rdir, "assessment.json"), {
      instructions: "Auditor edits proposals (status, evidenceIds, surfaces, notes) and adds evidence. Engine scores; do not enter numbers.",
      evidence: [],
      proposals: [...C.controls.values()].filter((c) => domains.includes(c.domain)).map((c) => ({ controlId: c.id, status: "UNVERIFIED", evidenceIds: [], surfaces: [], notes: "" })),
    });
    console.log(`${snapshotId} ${snapshot.status} Â· ${cap.fingerprint.contentManifest.fileCount} files Â· ${d.evidence.length} discovery evidence Â· ${d.inventory.signals.length} signals`);
    for (const n of cap.notes) console.log(`note: ${n}`);
    if (cap.invalidated) process.exit(2);
  },

  score() {
    blockOnContracts();
    const dir = tdir();
    const rdir = join(dir, "runs/RUN-0001");
    const target = readJ(join(dir, "target.json"));
    if (target.profile.confirmation.status !== "CONFIRMED") die("audit:G0 not passed: run osaudit confirm first");
    const run = readJ(join(rdir, "run.json"));
    const snapshot = readJ(join(rdir, "snapshot.captured.json"));
    if (snapshot.status !== "CAPTURED") die(`snapshot is ${snapshot.status}`);
    if (existsSync(join(rdir, "readiness.json"))) die("run already scored; scores are never recomputed in place");
    const sheet = readJ(join(rdir, "assessment.json"));
    const scoredAt = nowIso();

    // Evidence: discovery + auditor-authored; schema + citation verification against the stored snapshot.
    const manifest = new Map(getObject(dir, snapshot.storage.manifestObject).toString("utf8").split("\n").filter(Boolean).map((l) => { const [p, h] = l.split("\0"); return [p, "sha256:" + h]; }));
    const evidence = new Map<string, Json>();
    const errors: string[] = [];
    for (const e of [...readJ(join(rdir, "evidence.discovery.json")), ...sheet.evidence]) {
      errors.push(...C.validate("EvidenceItem", e).map((x) => `${e.id}: ${x}`));
      if (e.locator?.type === "REPOSITORY") {
        const h = manifest.get(e.locator.path);
        if (!h || h !== e.locator.contentHash) errors.push(`${e.id}: citation ${e.locator.path} does not match snapshot`);
        else if (e.locator.excerpt || e.locator.lineStart) {
          const lines = getObject(dir, h).toString("utf8").split(/\r?\n/);
          if ((e.locator.lineEnd ?? e.locator.lineStart) > lines.length) errors.push(`${e.id}: cited lines beyond end of ${e.locator.path}`);
          const span = lines.slice((e.locator.lineStart ?? 1) - 1, e.locator.lineEnd ?? lines.length).join("\n");
          if (e.locator.excerpt && !span.includes(e.locator.excerpt.text)) errors.push(`${e.id}: excerpt not found in cited lines`);
        }
      }
      if (evidence.has(e.id)) errors.push(`${e.id}: duplicate evidence id`);
      evidence.set(e.id, e);
    }

    // Findings generated from control templates (deterministic), never free-form.
    const types = deriveProjectTypes(C, target.profile);
    const findings: Json[] = [];
    const proposals = sheet.proposals.map((p: Json) => {
      const c = C.controls.get(p.controlId) ?? die(`unknown control ${p.controlId}`);
      const matched = matchedTypes(C, c, types);
      const findingIds: string[] = [];
      const tpl = matched.length ? c.findingTemplates.find((t: Json) => t.whenStatusIn.includes(p.status)) : undefined;
      const evs = p.evidenceIds.map((id: string) => evidence.get(id)).filter(Boolean);
      if (tpl && evs.length) {
        const best = evs.sort((x: Json, y: Json) => STRENGTH[y.strength] - STRENGTH[x.strength])[0];
        const severity = matched.map((t: string) => tpl.severityByProjectType?.[t] ?? tpl.severity).sort((x: string, y: string) => SEVERITY[y] - SEVERITY[x])[0];
        const surfaces = p.surfaces?.length ? p.surfaces : [{ type: "PROJECT", ref: "repository root" }];
        const id = `AUD-${String(findings.length + 1).padStart(4, "0")}`;
        findings.push({
          kind: "Finding", schemaVersion: "0.1.0", id, targetId: target.id, fingerprint: findingFingerprint(c.id, tpl.templateId, surfaces), title: tpl.title, domain: c.domain,
          controlId: c.id, templateId: tpl.templateId, severity, status: "OPEN", evidenceState: best.state, evidenceStrength: best.strength, evidenceIds: p.evidenceIds,
          impact: tpl.impact, affectedSurfaces: surfaces, recommendation: tpl.recommendation, verificationRequired: tpl.verificationRequired, owner: null, dependencies: [],
          launchBlocker: launchBlockerApplies(c, p.status, matched), introducedInAudit: run.id, introducedInSnapshot: snapshot.id, lastUpdated: scoredAt,
          verifiedAt: null, verificationEvidence: [], verificationRecordIds: [],
          history: [{ seq: 1, at: scoredAt, from: null, to: "OPEN", actor: { actorType: "SYSTEM", actorId: "osaudit.score" }, reason: `Generated from ${tpl.templateId}.`, runId: run.id, evidenceIds: p.evidenceIds }],
        });
        findingIds.push(id);
      }
      return { controlId: c.id, status: p.status, evidenceIds: p.evidenceIds, findingIds, proposedBy: { actorType: "AGENT", actorId: "claude-code" }, ...(p.notes ? { notes: p.notes } : {}) };
    });

    const out = scoreRun({ contracts: C, target, run, proposals, evidence, findings, scoredAt, snapshotRole: "BASELINE" });
    errors.push(...out.errors);
    for (const [title, objs] of [["Finding", findings], ["ControlResult", out.controlResults], ["DimensionScore", out.dimensions], ["ReadinessScore", [out.readiness]]] as const) {
      for (const x of objs) errors.push(...C.validate(title, x).map((e) => `${title} ${x.id ?? x.controlId ?? x.domain ?? ""}: ${e}`));
    }
    if (errors.length) die(`scoring rejected:\n  ${errors.join("\n  ")}`);

    writeOnceJson(join(rdir, "evidence.json"), [...evidence.values()]);
    writeOnceJson(join(rdir, "control-results.json"), out.controlResults);
    writeOnceJson(join(rdir, "findings.json"), findings);
    writeOnceJson(join(rdir, "dimension-scores.json"), out.dimensions);
    const h = writeOnceJson(join(rdir, "readiness.json"), out.readiness);
    appendLedger(dir, { objectKind: "ReadinessScore", objectId: run.id, objectHash: h, at: scoredAt });
    saveDraft(join(rdir, "run.json"), { ...run, stages: [...run.stages, { name: "SCORE", status: "DONE", inputsHash: out.readiness.inputsHash }], status: "COMPLETED", finishedAt: scoredAt });
    commands.report();
  },

  report() {
    const dir = tdir();
    const rdir = join(dir, "runs/RUN-0001");
    const finalPath = join(rdir, "snapshot.final.json");
    const snapshot = readJ(existsSync(finalPath) ? finalPath : join(rdir, "snapshot.captured.json"));
    const text = renderReport({
      contracts: C, target: readJ(join(dir, "target.json")), run: readJ(join(rdir, "run.json")), snapshot,
      evidence: new Map(readJ(join(rdir, "evidence.json")).map((e: Json) => [e.id, e])), controlResults: readJ(join(rdir, "control-results.json")),
      dimensions: readJ(join(rdir, "dimension-scores.json")), readiness: readJ(join(rdir, "readiness.json")), findings: readJ(join(rdir, "findings.json")), notes: readJ(join(rdir, "notes.json")),
    });
    writeFileSync(join(rdir, existsSync(finalPath) ? "report.md" : "report.draft.md"), text);
    console.log(`report written to ${join(rdir, existsSync(finalPath) ? "report.md" : "report.draft.md")}`);
  },

  finalize() {
    // Owner-only seal. After this the baseline is immutable; corrections are AuditNotes.
    const dir = tdir();
    const rdir = join(dir, "runs/RUN-0001");
    const snapshot = readJ(join(rdir, "snapshot.captured.json"));
    const parts = ["evidence.json", "control-results.json", "findings.json", "dimension-scores.json", "readiness.json"].map((f) => readJ(join(rdir, f)));
    const sealHash = sha256(canonical([snapshot, ...parts]));
    const ledgerEntryHash = appendLedger(dir, { objectKind: "BaselineSnapshot", objectId: snapshot.id, objectHash: sealHash });
    const final = { ...snapshot, status: "FINALIZED", finalization: { finalizedAt: nowIso(), finalizedBy: user(), sealHash, ledgerEntryHash } };
    check("BaselineSnapshot", final);
    writeOnceJson(join(rdir, "snapshot.final.json"), final);
    const ledger = verifyLedger(dir);
    if (ledger.length) die(ledger.join("\n"));
    commands.report();
    console.log(`finalized ${snapshot.id} Â· seal ${sealHash}`);
  },
};

(commands[cmd ?? ""] ?? (() => die("commands: validate | lock [--update] | init <path> | baseline | confirm --profile f | score | report | finalize  (all but validate/lock need --target)")))();

