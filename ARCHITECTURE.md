# Architecture — 1stStep OS Audit & Recovery

Status: **Foundation Cycle 0 — evaluated for audit:G1 (2026-09-13)**. Foundation decisions ADR-006…ADR-020 and later approved product-direction addenda ADR-021/022 are recorded in `DECISIONS.md`; the separate G1 ratification conflict remains unresolved.

## Standard free-audit lane (ADR-022; architecture only)

`source → read-only baseline → deterministic project detection → static analyzers → versioned control/approved PatternDefinition rules → cited evidence → findings/strengths/unknowns → deterministic priorities → OS and optional specialist capability mapping → structured template report`. No LLM, paid embeddings, reranking, search, enrichment, coding agent or usage-priced repository-analysis service is required for any step, retry or fallback. A free Genome records observed repository facts, constrained deterministic inference, user-confirmed answers and UNKNOWN separately. A few material questions may resolve business facts the source cannot; no large substitute questionnaire or invented semantic judgment. The free report explains the rule, evidence, applicability and limits. Reviewed patterns may be authored with paid/internal assistance **outside** this execution path, then run as deterministic versioned rules; the current `PatternDefinition` draft lacks executable detector fields, so an approved/versioned rule contract is still required before use.

The provider-neutral agent workers and model-cached assessment described below are **optional paid or internally authorized work**, never a mandatory stage of the standard free result. Existing `osaudit assess` and provider adapter descriptions are not proof of a separate free engine today. Sophisticated architecture/UX judgment, market fit and business strategy stay NOT ASSESSED until a suitable paid/human assessment. Public static observations remain distinct from runtime/private-system verification. Reports, priorities and optional agent recommendations need no model-generated text; mappings cite versioned rules and actual evidence, and healthy projects may need no specialist.

Safely reusable analysis fingerprints include project-scoped source identity, commit plus dirty-content manifest where relevant, engine/control/approved-pattern versions, analysis scope and evidence freshness. Cache keys and contents remain permission-aware; identical commits do not authorize cross-tenant evidence sharing. Bound repository size/count, CPU/time, network, concurrent/repeat runs and temporary storage; observe marginal infrastructure separately from paid external AI/API usage. Permanent `FREE-AUDIT-ZERO-METERED-COST` remains NOT_EVALUATED until a complete instrumented free run and negative dependency/fallback test prove no metered call. A mandatory paid provider blocks release unless Evan changes the invariant. No implementation is authorized by this addendum.

## 1. Shape

```text
            ┌──────────────────────────── engine-core (deterministic, no LLM) ────────────────────────────┐
AuditTarget │ intake → discover → snapshot → execute* → external* → assess → normalize → score → plan → report │ → audit bundle
            │    │         │          │           │            │          ▲          │          │               │
            └────┼─────────┼──────────┼───────────┼────────────┼──────────┼──────────┼──────────┼───────────────┘
                 │   detectors   content store   sandbox   connectors     │    registries (controls,
                 │   (read-only)  + ledger       (Docker)  (read-only)    │    project types, scoring,
                 │                                                        │    upstream lock)
                 └──────────── provider-neutral agent workers ────────────┘
                               (propose status + citations only)
* opt-in stages
```

- **engine-core** owns everything that must be reproducible: fingerprinting, the snapshot store, evidence validation, citation checks, applicability, scoring, lifecycle transitions, prioritization and exports. It never calls a model.
- **Agent workers** (any provider, per upstream `audit/UNIVERSAL_AGENT_AUDIT.md`) read the stored snapshot through a read-only tool surface and return schema-valid `EvidenceItem` / proposed `ControlResult.status` / finding candidates. The engine validates and scores.
- **CLI first, web later.** The MVP is a local CLI over a local store. A hosted dashboard later reads the same store format through the same engine.

## 2. Decisions by area

| Area | Decision (MVP) | Credible alternative | Why / trade-off |
|---|---|---|---|
| Application architecture | Engine library + local CLI; hosted web later on the same engine | Web SaaS first | Internal dogfood targets are local repos; code stays on the machine; the deterministic core must exist before any UI. Cost: no multi-user UX in MVP. |
| Implementation language | **OPEN (non-blocking).** Recommend TypeScript on Node 24 LTS, validated with Ajv (JSON Schema 2020-12) | Python 3.13 | Contracts are language-neutral JSON Schema, so G1 does not depend on this. TS matches a likely shared web stack with 1stStep OS, whose own stack (upstream ADR-010) is still open. Confirm before scaffolding. |
| Audit job execution | Pipeline of idempotent, checkpointed stages. Each stage records `inputsHash`/`outputsHash`. Model outputs are stored and cached by input hash, so re-running the pipeline re-scores stored outputs instead of re-sampling. | Monolithic agent session | Resumable after provider limits/failover (upstream `audit/PROVIDER_FAILOVER.md`); run identity never changes. |
| Repository access/import | MVP: `LOCAL_PATH`. Later: `GIT_URL` (read-only token, clone to store), GitHub App `contents:read`, `ARCHIVE_UPLOAD` with extraction limits | Direct live-directory analysis | Analysis always reads the **stored snapshot**, never the live working directory, so concurrent edits cannot change what was audited. |
| Baseline snapshot storage | Content-addressed write-once object store (`store/objects/sha256/aa/bb…`): `git bundle` (full history) + dirty overlay archive, or a full archive for non-git targets. Snapshot JSON sealed with `sealHash` and appended to a hash-chained `ledger.jsonl`. Hosted: object storage with object lock (WORM) plus append-only tables. | Copying the repo folder | Integrity can be checked; storage is deduplicated; immutability is enforceable. See `BASELINE_POLICY.md`. |
| Evidence storage | `EvidenceItem` JSON per run; large blobs (command output, provider responses) as content-addressed objects; excerpts redacted and size-capped | Free-text notes | Every claim is located, hashed and re-checkable. |
| Finding storage | Event-sourced: append-only transition history inside each finding plus a ledger entry per transition; current fields are a projection | Mutable rows | History is preserved; regressions reuse the same ID via the fingerprint. |
| Scoring engine | Pure function of (control results, evidence, findings as-of `scoredAt`, registries, pinned versions) → Dimension/Readiness scores + `inputsHash` | LLM-judged scores | Reproducible, explainable, and cannot be gamed. See `SCORING_MODEL.md`. |
| Report generation | Rendered from finalized JSON only: Markdown report (`reports/AUDIT_REPORT_TEMPLATE.md`) + JSON bundle; all target-derived text escaped | Model-written report prose | The report cannot say more than the data. Model summaries, if any, are labelled AI_GENERATED. |
| Background jobs | Local: foreground CLI with stage checkpoints. Hosted: a durable queue (Postgres-backed or a workflow engine) with one ephemeral sandbox per job | Always-on workers | Nothing to operate for MVP. |
| Connectors | Adapter per provider; read-only scopes; emits `EvidenceItem`s only; declares freshness TTL and environment class. MVP: public HTTP/TLS/DNS probe of user-confirmed domains + manual attestation import | Broad OAuth integrations | Least privilege; live state never mixes with code intent. See `EXTERNAL_EVIDENCE.md`. |
| Target isolation | Snapshot copy; agents run with cwd **outside** the target (so a target's `CLAUDE.md`/`AGENTS.md` is never loaded as agent instructions); commands only in a disposable Docker container on a copy | Running tools in the repo | See `SECURITY_BOUNDARIES.md`. |
| Security / prompt injection | Repository content is data; structured outputs only; deterministic citation verification; secret redaction before any model call; injection heuristics quarantine files | Trusting model judgment | See `SECURITY_BOUNDARIES.md`. |
| Export formats | Audit bundle (dir/zip: `manifest.json` with file hashes + all JSON objects + `report.md` + `recovery-plan.md`), SARIF 2.1.0 for code-located findings, CSV findings, upstream `Finding`/`Handoff`/`GateResult` exports. Later: HTML/PDF | Proprietary format | Portable, verifiable, CI-ingestible. |
| Continuous re-audit | Re-audit = new `AuditRun` on a new CURRENT snapshot referencing the baseline; findings matched by fingerprint; VERIFIED→OPEN on regression; evidence freshness TTLs drive re-verification. Later: scheduled/CI-triggered runs and upstream `intelligence.os_drift` | Overwriting the baseline | History and baseline scores are preserved; the delta is comparable only under identical versions. |

## 3. Storage layout (local MVP)

```text
<audit-home>/targets/TGT-…/
  target.json
  store/objects/sha256/ab/cdef…          write-once blobs (bundles, overlays, outputs)
  snapshots/SNAP-0001.json               sealed when FINALIZED
  runs/RUN-0001/{run.json, evidence/, control-results/, dimension-scores/, readiness.json, report.md}
  findings/AUD-0001.json                 projection; history is authoritative
  verification/VER-0001.json
  recovery/RP-0001.json, tasks/RT-0001.json, prompts/RT-0001.md
  notes/NOTE-0001.json                   append-only corrections
  ledger.jsonl                           {seq, at, objectKind, objectId, objectHash, prevHash}
```

The audit home is outside the target repository by default. The audit **never writes into the target**.

## 4. MVP scope

**In**
1. `osaudit init` — create an AuditTarget from a local path; infer the profile (upstream assessment pattern); derive project types; get user confirmation → audit:G0.
2. `osaudit discover` — read-only deterministic detectors for 13 signal categories (`recovery/DISCOVERY_SPEC.md`).
3. `osaudit baseline` — fingerprint, git bundle/overlay, manifest pre/post stability check, ledger → audit:G2.
4. `osaudit execute` (opt-in) — install/build/test/lint/typecheck/secret scan/dependency audit in a disposable Docker container.
5. `osaudit assess` — provider-neutral agent workers over seed controls; schema-validated outputs; citation verifier.
6. `osaudit score` — deterministic scoring and reproducibility hash.
7. `osaudit report` / `finalize` — Markdown + JSON bundle, seal, user finalization.
8. `osaudit plan` — P0/P1/P2, dependency order, scoped prompts, Project OS handoff draft (upstream ProjectProfile).
9. `osaudit verify` / `reaudit` — CURRENT snapshot, VerificationRecords, lifecycle transitions, comparable delta.
10. Evidence: public HTTP/TLS/DNS probe of confirmed domains; manual attestation import (E2); SARIF + CSV export.

**Out (later cycles):** hosted web UI and multi-tenancy; GitHub App/URL import; provider connectors (Vercel, Supabase, Stripe, PostHog, GitHub API, app stores); scheduled re-audit; HTML/PDF; automated remediation execution; controls deeper than the 52-control seed registry.

## 5. Non-functional guarantees

- Same stored inputs + same pinned versions ⇒ byte-identical scores and `inputsHash`.
- A finalized snapshot/run is never rewritten; corrections are `AuditNote`s.
- No network egress from analysis except the configured model provider and explicitly enabled connectors.
- Local-only mode: a policy can require local models (upstream `audit/PROVIDER_POLICY.md`).
