# Finding Schema & Lifecycle — v0.1.0

Schema: `schemas/audit/0.1.0/finding.schema.json`. Upstream export mapping: `INTEGRATION_CONTRACT.md` §3.

## Fields
`id` (immutable `AUD-0001`, per target, never reused) · `fingerprint` · `title` · `domain` · `controlId` · `templateId` · `severity` CRITICAL|HIGH|MEDIUM|LOW|INFO · `status` · `evidenceState` · `evidenceStrength` · `evidenceIds` · `impact` · `affectedSurfaces` · `recommendation` · `verificationRequired {method, minStrength}` · `owner` · `dependencies` · `launchBlocker` · `introducedInAudit` · `introducedInSnapshot` · `lastUpdated` · `verifiedAt` · `verificationEvidence` · `verificationRecordIds` · `duplicateOf` · `acceptedRisk` · `history[]`.

Severity comes from the control's finding template (`severityByProjectType` overrides, MAX across matched types). Auditors may raise severity with a note but may not lower it below the template.

## Status meanings
- **OPEN** — confirmed gap.
- **IN_PROGRESS** — remediation task started.
- **BLOCKED** — cannot proceed (decision, access, dependency).
- **REMEDIATED** — a change was made. **Not proof.** Scores and caps are unchanged.
- **VERIFIED** — independent evidence proves resolution.
- **ACCEPTED_RISK** — owner accepts it with rationale and expiry. Launch-blocker findings need `HIGH_RISK_APPROVAL`.
- **NOT_APPLICABLE** — evidence shows the finding does not apply.
- **DUPLICATE** — `duplicateOf` another finding.

## State machine
```text
(new) ──► OPEN ──► IN_PROGRESS ──► REMEDIATED ──► VERIFIED
           │  ▲        │   ▲            │             │
           │  └────────┘   │            │ FAIL        │ regression (re-audit)
           │   BLOCKED ◄───┘            ▼             ▼
           ├──► ACCEPTED_RISK ──► OPEN (expiry/revoke)
           ├──► NOT_APPLICABLE ──► OPEN
           └──► DUPLICATE ──► OPEN
OPEN → REMEDIATED allowed (fixed outside a task, observed in re-audit); OPEN → VERIFIED never.
```

## Transition rules (engine-enforced)
1. `history` is append-only. `seq` increments by 1, `from` equals the previous `to`, timestamps never decrease, and the first entry is `null → OPEN`. Current fields are a projection of the last entry.
2. `→ REMEDIATED` needs `remediationTaskId` or `runId`.
3. `→ VERIFIED` needs a `VerificationRecord` with result PASS for this finding, where:
   - verifier ≠ remediatedBy,
   - it was taken on a CURRENT snapshot (not the introducing baseline),
   - all evidence strength ≥ `verificationRequired.minStrength`,
   - evidence was collected after the REMEDIATED transition.
4. `REMEDIATED → OPEN` needs a FAIL VerificationRecord or a re-audit run. `VERIFIED → OPEN` (regression) needs a re-audit `runId`. The ID is kept.
5. `→ ACCEPTED_RISK` needs `acceptedRisk {approvedBy USER, approvalClass, rationale, expiresAt}`.
6. Findings are never deleted. Re-audits match new candidates to existing findings by `fingerprint = sha256(canonical [controlId, templateId, sorted "TYPE:ref" surfaces])`: same fingerprint means same ID.
7. Scoring reads status **as of `scoredAt`**, so later transitions never change historical scores.
