// Finding lifecycle (FINDING_SCHEMA.md): legal transitions, projection, independent verification, fingerprints.
import { type Json, shaJson } from "./util.ts";
import { STRENGTH } from "./scoring.ts";

export const ALLOWED: Record<string, string[]> = {
  "": ["OPEN"],
  OPEN: ["IN_PROGRESS", "BLOCKED", "REMEDIATED", "ACCEPTED_RISK", "NOT_APPLICABLE", "DUPLICATE"],
  IN_PROGRESS: ["REMEDIATED", "BLOCKED", "OPEN"],
  BLOCKED: ["OPEN", "IN_PROGRESS"],
  REMEDIATED: ["VERIFIED", "OPEN"],
  VERIFIED: ["OPEN"],
  ACCEPTED_RISK: ["OPEN"],
  NOT_APPLICABLE: ["OPEN"],
  DUPLICATE: ["OPEN"],
};

/** First template whose status list matches. Registry order puts the ABSENT ("Not implemented") template before defect wording. */
export const findingTemplate = (control: Json, status: string): Json | undefined =>
  control.findingTemplates.find((t: Json) => t.whenStatusIn.includes(status));

export const findingFingerprint = (controlId: string, templateId: string | undefined, surfaces: Json[]): string =>
  shaJson([controlId, templateId ?? null, surfaces.map((s) => `${s.type}:${String(s.ref).trim().toLowerCase()}`).sort()]);

/** Returns every rule violation for one finding; empty array = valid. */
export function checkFinding(f: Json, ctx: { evidence: Map<string, Json>; verifications: Map<string, Json> }): string[] {
  const errs: string[] = [];
  const lab = `Finding ${f.id}`;
  for (const id of [...f.evidenceIds, ...f.verificationEvidence]) if (!ctx.evidence.has(id)) errs.push(`${lab}: unknown evidence ${id}`);
  if (f.fingerprint !== findingFingerprint(f.controlId, f.templateId, f.affectedSurfaces)) errs.push(`${lab}: fingerprint mismatch`);

  let prev = "", prevAt = "", remediatedAt: string | undefined;
  f.history.forEach((h: Json, i: number) => {
    if (h.seq !== i + 1 || (h.from ?? "") !== prev || !ALLOWED[prev]?.includes(h.to) || h.at < prevAt) {
      errs.push(`${lab}: illegal history entry seq ${h.seq} ${h.from}->${h.to}`);
    }
    if (h.to === "REMEDIATED") {
      remediatedAt = h.at;
      if (!h.remediationTaskId && !h.runId) errs.push(`${lab}: REMEDIATED needs remediationTaskId or runId`);
    }
    if (h.to === "VERIFIED") {
      const v = ctx.verifications.get(h.verificationRecordId);
      if (!v || v.result !== "PASS" || v.findingId !== f.id) errs.push(`${lab}: VERIFIED needs a PASS VerificationRecord for this finding`);
      else {
        if (v.verifier.actorType === v.remediatedBy.actorType && v.verifier.actorId === v.remediatedBy.actorId) errs.push(`${lab}: verifier must differ from remediator`);
        if (v.snapshotId === f.introducedInSnapshot) errs.push(`${lab}: verification must use a CURRENT snapshot, not the baseline`);
        for (const id of v.evidenceIds) {
          const e = ctx.evidence.get(id);
          if (!e) { errs.push(`${lab}: unknown verification evidence ${id}`); continue; }
          if (STRENGTH[e.strength] < STRENGTH[f.verificationRequired.minStrength]) errs.push(`${lab}: verification evidence ${id} below required strength`);
          if (remediatedAt && e.collectedAt <= remediatedAt) errs.push(`${lab}: verification evidence ${id} predates remediation`);
        }
      }
    }
    if ((prev === "REMEDIATED" || prev === "VERIFIED") && h.to === "OPEN" && !h.verificationRecordId && !h.runId) errs.push(`${lab}: reopen needs a failing verification or re-audit run`);
    prev = h.to;
    prevAt = h.at;
  });
  if (f.status !== prev) errs.push(`${lab}: status must equal last history entry (${prev})`);
  if (f.lastUpdated !== prevAt) errs.push(`${lab}: lastUpdated must equal last history time`);
  return errs;
}

/** Appends a transition and re-projects; throws on an illegal move. Never edits existing entries. */
export function transition(f: Json, t: { to: string; at: string; actor: Json; reason: string; runId?: string; remediationTaskId?: string; verificationRecordId?: string; evidenceIds?: string[] }): Json {
  if (!ALLOWED[f.status]?.includes(t.to)) throw new Error(`illegal transition ${f.status} -> ${t.to} for ${f.id}`);
  const entry = Object.fromEntries(Object.entries({ seq: f.history.length + 1, from: f.status, ...t }).filter(([, v]) => v !== undefined));
  return { ...f, history: [...f.history, entry], status: t.to, lastUpdated: t.at, ...(t.to === "VERIFIED" ? { verifiedAt: t.at } : {}) };
}
