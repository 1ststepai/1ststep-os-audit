// Golden + tamper tests. Ported from tools/validate_foundation.py (removed after this port).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { loadContracts, REPO_ROOT } from "../src/contracts.ts";
import { checkFinding, findingTemplate, transition } from "../src/lifecycle.ts";
import { prioritize } from "../src/plan.ts";
import { scoreRun } from "../src/scoring.ts";
import { type Json, canonical } from "../src/util.ts";

const C = loadContracts();
const baseFixture = JSON.parse(readFileSync(join(REPO_ROOT, "fixtures/foundation-example.json"), "utf8")).objects as Json[];

/** Every rule the engine enforces over a fixture; returns violations. */
function audit(objects: Json[]): string[] {
  const k = (kind: string) => objects.filter((o) => o.kind === kind);
  const errs: string[] = [];
  for (const o of objects) errs.push(...C.validate(o.kind, o).map((e) => `${o.kind} ${o.id ?? o.controlId ?? o.domain}: ${e}`));
  const evidence = new Map(k("EvidenceItem").map((e) => [e.id, e]));
  const findings = k("Finding");
  const rs = k("ReadinessScore")[0];
  const run = k("AuditRun").find((r) => r.id === rs.runId);
  const target = k("AuditTarget")[0];
  const stored = k("ControlResult").filter((r) => r.runId === run.id);

  const out = scoreRun({
    contracts: C, target, run, evidence, findings, scoredAt: rs.scoredAt, snapshotRole: rs.snapshotRole, versions: rs.versions,
    proposals: stored.map((r) => ({ controlId: r.controlId, status: r.status, evidenceIds: r.evidenceIds, findingIds: r.findingIds, proposedBy: r.proposedBy, notes: r.notes })),
  });
  errs.push(...out.errors);
  if (canonical(out.types) !== canonical(target.profile.auditProjectTypes.value)) errs.push("derived project types differ");
  const fields = ["weight", "level", "evidenceCap", "finalScore", "launchBlocker"];
  for (const r of stored) {
    const g = out.controlResults.find((x) => x.controlId === r.controlId);
    for (const f of fields) if (canonical(g[f]) !== canonical(r[f])) errs.push(`ControlResult ${r.controlId} ${f}`);
  }
  for (const d of k("DimensionScore")) if (canonical(out.dimensions.find((x: Json) => x.domain === d.domain)) !== canonical(d)) errs.push(`DimensionScore ${d.domain}`);
  for (const f of Object.keys(rs)) if (canonical((out.readiness as Json)[f]) !== canonical(rs[f])) errs.push(`ReadinessScore ${f}`);

  const ctx = { evidence, verifications: new Map(k("VerificationRecord").map((v) => [v.id, v])) };
  for (const f of findings) errs.push(...checkFinding(f, ctx));

  const plan = k("RecoveryPlan")[0];
  const p = prioritize(C, out.types, k("RemediationTask"), new Map(findings.map((f) => [f.id, f])));
  errs.push(...p.errors);
  for (const t of k("RemediationTask")) if (t.priority !== p.priority.get(t.id)) errs.push(`${t.id} priority`);
  if (canonical(plan.priorities) !== canonical(p.priorities)) errs.push("RecoveryPlan priorities");
  if (canonical(plan.executionOrder) !== canonical(p.executionOrder)) errs.push("RecoveryPlan executionOrder");
  return errs;
}

const mutate = (fn: (o: Json[]) => void): Json[] => { const o = structuredClone(baseFixture); fn(o); return o; };
const find = (o: Json[], kind: string, key: string, val: string) => o.find((x) => x.kind === kind && x[key] === val);

test("contracts: upstream lock, schemas and registries are consistent", () => {
  assert.deepEqual(C.errors, []);
  assert.equal(C.controls.size, 52);
  assert.equal(C.profiles.size, 11);
});

test("golden: worked example reproduces exactly", () => {
  assert.deepEqual(audit(baseFixture), []);
});

const tamper: [string, (o: Json[]) => void, string][] = [
  ["doc-only score inflation", (o) => { find(o, "ControlResult", "controlId", "CTL-AUTH-002").finalScore = 75; }, "ControlResult CTL-AUTH-002 finalScore"],
  ["self-verification", (o) => { const v = find(o, "VerificationRecord", "id", "VER-0001"); v.verifier = v.remediatedBy; }, "verifier must differ"],
  ["documentation promoted to E3", (o) => { find(o, "EvidenceItem", "id", "EV-0001-0005").strength = "E3"; }, "EvidenceItem EV-0001-0005"],
  ["severity cap ignored", (o) => { find(o, "ReadinessScore", "runId", "RUN-0001").score = 49; }, "ReadinessScore score"],
  ["OPEN -> VERIFIED shortcut", (o) => {
    const f = find(o, "Finding", "id", "AUD-0002");
    f.history.push({ seq: 2, at: "2026-09-14T00:00:00Z", from: "OPEN", to: "VERIFIED", actor: { actorType: "AGENT", actorId: "security-auditor" }, reason: "claimed fixed" });
    f.status = "VERIFIED"; f.lastUpdated = "2026-09-14T00:00:00Z";
  }, "illegal history entry"],
  ["ABSENT justified by docs", (o) => { find(o, "ControlResult", "controlId", "CTL-DOCUMENTATION_OS-001").evidenceIds = ["EV-0001-0005"]; }, "ABSENT requires E3+"],
  ["finding ID/surface rewritten", (o) => { find(o, "Finding", "id", "AUD-0002").affectedSurfaces[0].ref = "GET /api/other"; }, "fingerprint mismatch"],
  ["baseline rescored with later status", (o) => { find(o, "ReadinessScore", "runId", "RUN-0001").scoredAt = "2026-09-15T00:00:00Z"; }, "ReadinessScore"],
];
for (const [name, fn, needle] of tamper) {
  test(`tamper rejected: ${name}`, () => {
    const errs = audit(mutate(fn));
    assert.ok(errs.some((e) => e.includes(needle)), `expected "${needle}" in ${JSON.stringify(errs)}`);
  });
}

test("wording: not-built controls say 'Not implemented'; inverted controls keep defect wording", () => {
  const title = (id: string, status: string) => findingTemplate(C.controls.get(id), status)?.title as string;
  assert.match(title("CTL-AUTH-003", "ABSENT"), /^Not implemented: /);
  assert.equal(title("CTL-AUTH-003", "PARTIAL"), "Cross-tenant data access possible");
  assert.equal(title("CTL-SECURITY-001", "ABSENT"), "Secrets committed to repository");
  assert.equal(title("CTL-SECURITY-002", "PARTIAL"), "Dependency vulnerabilities are not managed");
  for (const c of C.controls.values()) {
    const statuses = c.findingTemplates.flatMap((t: Json) => t.whenStatusIn);
    assert.equal(new Set(statuses).size, statuses.length, `${c.id}: a status maps to more than one template`);
  }
});

test("lifecycle: transition appends history and refuses illegal moves", () => {
  const f = find(baseFixture, "Finding", "id", "AUD-0002");
  const actor = { actorType: "USER", actorId: "user.owner" };
  const next = transition(f, { to: "IN_PROGRESS", at: "2026-09-14T01:00:00Z", actor, reason: "start", remediationTaskId: "RT-0002" });
  assert.equal(next.history.length, 2);
  assert.equal(f.history.length, 1, "original not mutated");
  assert.throws(() => transition(f, { to: "VERIFIED", at: "2026-09-14T01:00:00Z", actor, reason: "skip" }));
});
