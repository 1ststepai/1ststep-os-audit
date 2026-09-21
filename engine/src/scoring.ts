// Deterministic scoring engine (SCORING_MODEL.md v0.1.0). Never calls a model.
import type { Contracts } from "./contracts.ts";
import { type Json, roundHalfUp, shaJson } from "./util.ts";

export const STRENGTH: Record<string, number> = { E0: 0, E1: 1, E2: 2, E3: 3, E4: 4 };
export const SEVERITY: Record<string, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const r1 = (x: number) => roundHalfUp(x, 1);

function fieldValue(profile: Json, path: string): Json {
  let n = profile;
  for (const part of path.split(".")) n = n && typeof n === "object" ? n[part] : undefined;
  return n && n.status === "KNOWN" ? n.value : undefined;
}

function cond(profile: Json, c: Json): boolean {
  const v = fieldValue(profile, c.field);
  if (v === undefined) return false;
  const vals = new Set<Json>(c.values ?? []);
  switch (c.operator) {
    case "INCLUDES_ANY": return v.some((x: Json) => vals.has(x));
    case "EXCLUDES_ALL": return !v.some((x: Json) => vals.has(x));
    case "IN": return vals.has(v);
    case "IS_TRUE": return v === true;
    case "IS_FALSE": return v === false;
  }
  return false;
}

export const deriveProjectTypes = (C: Contracts, profile: Json): string[] =>
  C.ptp.profiles
    .filter((p: Json) => (p.derivation.all ?? []).every((c: Json) => cond(profile, c)) && (!p.derivation.any || p.derivation.any.some((c: Json) => cond(profile, c))))
    .map((p: Json) => p.id);

export const matchedTypes = (C: Contracts, control: Json, types: string[]): string[] =>
  types.filter((t) => (control.applicability.projectTypes.includes("ALL") || control.applicability.projectTypes.includes(t)) && !C.profiles.get(t).excludeControls.includes(control.id));

export const domainWeight = (C: Contracts, domain: string, types: string[]): number =>
  Math.max(...types.map((t) => C.profiles.get(t).domainWeights[domain] ?? C.ptp.domainDefaults[domain]));

const controlWeight = (C: Contracts, control: Json, matched: string[]): number =>
  control.riskWeight * Math.max(...matched.map((t) => C.profiles.get(t).controlMultipliers[control.id] ?? 1));

export function evidenceCap(C: Contracts, control: Json, evs: Json[]): Json {
  if (!evs.length) return { value: 0, reason: "NO_SUPPORTING_EVIDENCE" };
  let best: [number, string, string] | undefined;
  for (const e of evs) {
    const kindCap = control.evidenceKindCaps?.[e.sourceKind] ?? C.scoring.defaultSourceKindCaps[e.sourceKind] ?? 100;
    const strengthCap = C.scoring.evidenceCaps[e.strength];
    const v = Math.min(kindCap, strengthCap);
    if (!best || v > best[0]) best = [v, kindCap < strengthCap ? "SOURCE_KIND_CAP" : "STRENGTH_CAP", e.id];
  }
  const [v, reason, id] = best!;
  const live = evs.some((e) => C.scoring.sourceKinds[e.sourceKind].plane === "LIVE");
  if (control.requiredPlane === "LIVE" && !live && C.scoring.livePlaneCap < v) return { value: C.scoring.livePlaneCap, reason: "LIVE_PLANE_CAP" };
  return v >= 100 ? { value: 100, reason: "NONE" } : { value: v, limitingEvidenceId: id, reason };
}

export function statusAt(finding: Json, at: string): string | null {
  let s: string | null = null;
  for (const h of finding.history) if (h.at <= at) s = h.to;
  return s;
}

export const launchBlockerApplies = (control: Json, status: string, matched: string[]): boolean => {
  const lb = control.launchBlocker;
  return !!(lb.enabled && lb.whenStatusIn.includes(status) && (lb.projectTypes.includes("ALL") || matched.some((t) => lb.projectTypes.includes(t))));
};

export type Proposal = { controlId: string; status: string; evidenceIds: string[]; findingIds: string[]; proposedBy: Json; notes?: string };
export type ScoreInput = {
  contracts: Contracts; target: Json; run: Json; proposals: Proposal[]; evidence: Map<string, Json>; findings: Json[];
  scoredAt: string; snapshotRole: "BASELINE" | "CURRENT"; versions?: Json;
};

export function scoreRun(inp: ScoreInput) {
  const C = inp.contracts;
  const S = C.scoring;
  const errors: string[] = [];
  const types = deriveProjectTypes(C, inp.target.profile);
  const findingsById = new Map<string, Json>(inp.findings.map((f) => [f.id, f]));
  const versions = inp.versions ?? C.versions;

  const controlResults = inp.proposals.map((p) => {
    const c = C.controls.get(p.controlId);
    if (!c) { errors.push(`unknown control ${p.controlId}`); return null; }
    const matched = matchedTypes(C, c, types);
    const evs = p.evidenceIds.map((id) => inp.evidence.get(id) ?? (errors.push(`${p.controlId}: unknown evidence ${id}`), null)).filter(Boolean);
    const base = { kind: "ControlResult", schemaVersion: "0.1.0", runId: inp.run.id, controlId: c.id, controlVersion: c.version, domain: c.domain };
    if (!matched.length) {
      return { ...base, applicability: { status: "NOT_APPLICABLE", matchedProjectTypes: [], reason: `Not applicable to ${types.join(", ")}` },
        status: "NOT_APPLICABLE", evidenceIds: p.evidenceIds, proposedBy: p.proposedBy, weight: null, level: null, evidenceCap: null, finalScore: null, findingIds: [], launchBlocker: false };
    }
    if (p.status === "VERIFIED" && !evs.some((e) => e.strength === "E4")) errors.push(`${c.id}: VERIFIED requires E4 evidence`);
    if (p.status === "ABSENT" && !evs.some((e) => ["ABSENCE", "REFUTES"].includes(e.polarity) && STRENGTH[e.strength] >= 3)) errors.push(`${c.id}: ABSENT requires E3+ absence/refuting evidence`);
    const level = S.statusLevels[p.status];
    const cap = evidenceCap(C, c, evs);
    const lb = launchBlockerApplies(c, p.status, matched);
    for (const fid of p.findingIds) {
      const f = findingsById.get(fid);
      if (!f || f.controlId !== c.id) errors.push(`${c.id}: finding ${fid} missing or bound to another control`);
      else if (f.launchBlocker !== lb) errors.push(`${fid}: launchBlocker must be ${lb}`);
    }
    return {
      ...base,
      applicability: { status: "APPLICABLE", matchedProjectTypes: matched, reason: c.applicability.projectTypes.includes("ALL") ? "projectTypes ALL" : `${matched.join(", ")} listed` },
      status: p.status, evidenceIds: p.evidenceIds, proposedBy: p.proposedBy,
      weight: controlWeight(C, c, matched), level, evidenceCap: cap, finalScore: Math.min(level, cap.value), findingIds: p.findingIds, launchBlocker: lb,
      ...(p.notes ? { notes: p.notes } : {}),
    };
  }).filter(Boolean) as Json[];

  const active = new Set<string>(S.capActiveFindingStatuses);
  const exact = new Map<string, [number, number]>();
  const dimensions = inp.run.scope.domains.map((domain: string) => {
    const crs = controlResults.filter((r) => r.domain === domain && r.applicability.status !== "NOT_APPLICABLE");
    const w = domainWeight(C, domain, types);
    const base = { kind: "DimensionScore", schemaVersion: "0.1.0", runId: inp.run.id, domain, weight: w };
    if (w === 0 || !crs.length) {
      return { ...base, included: false, exclusionReason: w === 0 ? "ZERO_WEIGHT" : "NO_APPLICABLE_CONTROLS", controls: [], rawScore: null, caps: [], score: null, findingIds: [], unverifiedControlIds: [], cappedControlIds: [] };
    }
    const raw = crs.reduce((a, r) => a + r.weight * r.finalScore, 0) / crs.reduce((a, r) => a + r.weight, 0);
    const fids = [...new Set<string>(crs.flatMap((r) => r.findingIds))].sort();
    const caps: Json[] = [];
    for (const sev of ["CRITICAL", "HIGH"]) {
      const hit = fids.filter((f) => findingsById.get(f)?.severity === sev && active.has(statusAt(findingsById.get(f), inp.scoredAt) ?? ""));
      if (hit.length) caps.push({ type: `SEVERITY_${sev}`, limit: S.severityDimensionCaps[sev], binding: false, findingIds: hit, reason: `Open ${sev} finding caps dimension at ${S.severityDimensionCaps[sev]}.` });
    }
    const lowest = Math.min(...caps.map((c) => c.limit));
    for (const c of caps) c.binding = c.limit === lowest && lowest < raw;
    const score = Math.min(raw, lowest);
    exact.set(domain, [w, score]);
    return {
      ...base, included: true, controls: crs.map((r) => ({ controlId: r.controlId, weight: r.weight, finalScore: r.finalScore })),
      rawScore: r1(raw), caps, score: r1(score), findingIds: fids,
      unverifiedControlIds: crs.filter((r) => ["UNVERIFIED", "BLOCKED"].includes(r.status)).map((r) => r.controlId),
      cappedControlIds: crs.filter((r) => r.finalScore < r.level).map((r) => r.controlId),
    };
  });

  const included = [...exact.entries()];
  const uncapped = included.reduce((a, [, [w, s]]) => a + w * s, 0) / included.reduce((a, [, [w]]) => a + w, 0);
  const lbFindings = inp.findings.filter((f) => f.launchBlocker && active.has(statusAt(f, inp.scoredAt) ?? "")).map((f) => f.id).sort();
  const overall = lbFindings.length ? Math.min(uncapped, S.launchBlockerOverallCap) : uncapped;

  const applicable = controlResults.filter((r) => r.applicability.status !== "NOT_APPLICABLE");
  const strongEvidence = (r: Json) => r.evidenceIds.some((id: string) => STRENGTH[inp.evidence.get(id)?.strength] >= 3);
  const ratio = applicable.reduce((a, r) => a + (strongEvidence(r) && r.finalScore >= r.level ? r.weight : 0), 0) / applicable.reduce((a, r) => a + r.weight, 0);
  const lbEvidenced = applicable
    .filter((r) => { const lb = C.controls.get(r.controlId).launchBlocker; return lb.enabled && (lb.projectTypes.includes("ALL") || r.applicability.matchedProjectTypes.some((t: string) => lb.projectTypes.includes(t))); })
    .every(strongEvidence);
  const level = ratio >= S.confidence.HIGH && lbEvidenced ? "HIGH" : ratio >= S.confidence.MEDIUM ? "MEDIUM" : "LOW";

  const inputs = {
    versions, projectTypes: types, domains: [...inp.run.scope.domains].sort(), scoredAt: inp.scoredAt,
    controlResults: controlResults
      .map((r) => ({ controlId: r.controlId, status: r.status, evidence: r.evidenceIds.map((id: string) => [inp.evidence.get(id).sourceKind, inp.evidence.get(id).strength]).sort() }))
      .sort((a, b) => (a.controlId < b.controlId ? -1 : 1)),
    findings: inp.findings
      .map((f) => ({ id: f.id, domain: f.domain, severity: f.severity, launchBlocker: f.launchBlocker, status: statusAt(f, inp.scoredAt) }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
  };

  const readiness = {
    kind: "ReadinessScore", schemaVersion: "0.1.0", runId: inp.run.id, targetId: inp.target.id, snapshotRole: inp.snapshotRole, scoredAt: inp.scoredAt,
    versions, projectTypes: types, inputsHash: shaJson(inputs),
    dimensions: included.map(([domain, [w, s]]) => ({ domain, weight: w, score: r1(s) })),
    uncappedScore: r1(uncapped),
    caps: lbFindings.length ? [{ type: "LAUNCH_BLOCKER", limit: S.launchBlockerOverallCap, binding: S.launchBlockerOverallCap < uncapped, findingIds: lbFindings, reason: `Open launch blocker caps overall at ${S.launchBlockerOverallCap}.` }] : [],
    score: r1(overall),
    label: S.labels.find((l: Json) => r1(overall) >= l.min).label,
    launchBlocked: lbFindings.length > 0,
    launchBlockerFindingIds: lbFindings,
    acceptedRiskFindingIds: inp.findings.filter((f) => statusAt(f, inp.scoredAt) === "ACCEPTED_RISK").map((f) => f.id).sort(),
    confidence: { level, strongEvidenceWeightRatio: roundHalfUp(ratio, 3), unverifiedControlCount: applicable.filter((r) => ["UNVERIFIED", "BLOCKED"].includes(r.status)).length, launchBlockerControlsEvidenced: lbEvidenced },
  };
  return { types, controlResults, dimensions, readiness, errors };
}
