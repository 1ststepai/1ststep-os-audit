# Decisions

## ADR-001 — Separate companion product
**ACCEPTED:** 1stStep OS Audit & Recovery is a distinct project/repository but shares the Project OS capability standard.

## ADR-002 — Audit before repair
**ACCEPTED:** Baseline is finalized before remediation begins.

## ADR-003 — Immutable history
**ACCEPTED:** Baselines and finding IDs are immutable; current state evolves separately.

## ADR-004 — Evidence-capped scoring
**ACCEPTED:** Readiness scores cannot outrun evidence strength.

## ADR-005 — Whole-product audit
**ACCEPTED:** Audit includes engineering, business, growth, operations, AI efficiency, continuity, and release readiness—not code alone.

---
Foundation Cycle 0 (2026-09-13). Owner ratified audit:G1 architecture in session on 2026-09-13 (chose "build engine, self-audit"); ADR-006…020 are ACCEPTED as engine architecture. Per ADR-021, customer-facing score publication remains OPEN pending the G1.5 evidence review. Detail in `ARCHITECTURE.md`.

## ADR-006 — Engine-first, local-first MVP
**PROPOSED:** A deterministic engine library plus a local CLI is the MVP. The hosted web app comes later on the same engine and store format. Alternative (web SaaS first) rejected for MVP: dogfood targets are local, code stays on-machine, and the core must be reproducible before any UI exists.

## ADR-007 — Language-neutral contracts; TypeScript on Node 24
**ACCEPTED (owner, 2026-09-13):** Contracts are JSON Schema 2020-12 plus versioned JSON registries. Engine and CLI are TypeScript run directly by Node 24 (native type stripping, no build step), validated with Ajv. Revisit if upstream 1stStep OS ADR-010 picks an incompatible stack.

Owner ratified audit:G1 on 2026-09-13; ADR-006…020 move from PROPOSED to ACCEPTED.

## ADR-008 — Checkpointed idempotent pipeline, provider-neutral workers
**PROPOSED:** Stages intake → discover → snapshot → execute* → external* → assess → normalize → score → plan → report → finalize. State is persisted outside model conversations. Model outputs are cached by input hash. Failover never changes run identity (upstream `audit/UNIVERSAL_AGENT_AUDIT.md`, `PROVIDER_FAILOVER.md`).

## ADR-009 — Snapshot-then-audit
**PROPOSED:** All analysis reads a stored snapshot. The live target is touched only during read-only capture and is never written.

## ADR-010 — Content-addressed store + hash-chained ledger
**PROPOSED:** Write-once objects (git bundle + dirty overlay, or a full archive), sealed snapshots, append-only ledger. Hosted mode uses WORM object lock and append-only tables.

## ADR-011 — Two-axis evidence with source-kind ceilings and planes
**PROPOSED:** Upstream evidence state × audit strength E0–E4, with schema-enforced pairings. Documentation is ≤E2. REPOSITORY (intent) and LIVE (state) planes stay separate; LIVE controls are capped at 50 without live evidence.

## ADR-012 — Deterministic scoring; models never score
**PROPOSED:** Agents propose status and citations. The engine applies caps (strength, source kind, plane, severity, launch blocker), computes weights from project types, and records `inputsHash` and pinned versions. Findings are evaluated as of `scoredAt`.

## ADR-013 — Event-sourced finding lifecycle
**PROPOSED:** Append-only history. REMEDIATED ≠ VERIFIED and does not lift caps. VERIFIED needs an independent VerificationRecord on a CURRENT snapshot at the required strength. Fingerprints preserve IDs across re-audits and regressions.

## ADR-014 — Sandboxed, opt-in command execution
**PROPOSED:** Build/test/lint/scan commands run only in a disposable Docker container on a copy, with no network (registry-only for install, scripts disabled) and no host environment. Without a sandbox, controls stay UNVERIFIED.

## ADR-015 — Read-only connectors emit evidence only
**PROPOSED:** Connectors are least-privilege and read-only, declare environment class and freshness TTL, and cannot create findings or scores. MVP: public HTTP/TLS/DNS probe of confirmed domains plus manual attestation (E2).

## ADR-016 — Reference, don't copy, the upstream standard
**PROPOSED:** Upstream 1stStep OS schemas are `$ref`'d by `$id` and hash-locked (`upstream-lock.json`). Controls bind to upstream `capabilityId`s. Project types derive from upstream ProjectProfile. Audit Finding exports to upstream Finding (`INTEGRATION_CONTRACT.md`).

## ADR-017 — Portable exports
**PROPOSED:** Audit bundle (JSON objects + hashed manifest), Markdown report and recovery plan, SARIF 2.1.0, CSV, plus upstream Finding/GateResult/Handoff. HTML/PDF later.

## ADR-018 — Re-audit as new runs, never rewrites
**PROPOSED:** CURRENT snapshots and new runs link to the baseline. Deltas are comparable only under identical versions. Registry upgrades create labelled rescoring records.

## ADR-019 — Gate records use upstream GateResult with ratification
**PROPOSED:** Agent-evaluated gates are `ratification: PENDING` until the owner ratifies. Audit gates are namespaced `audit:Gx`.

## ADR-020 — Domain taxonomy = 33 dimensions
**PROPOSED:** `domains.json` extended with CODE_QUALITY and ACCESSIBILITY to match `AUDIT_STANDARD.md`. Every domain has a contract and at least one control.

## ADR-021 — Evidence-first free audit presentation for 1stStep OS
**PRODUCT DIRECTION ACCEPTED by Evan (2026-09-13); Audit implementation and score-publication rule OPEN.** The primary future existing-builder entry is a useful free audit with pinned source, applicable domains, evidence-backed strengths/findings/unknowns, prioritized work and a justified OS recommendation. Paid spin-up and optional specialist agents follow only if appropriate; audit results cannot be altered to manufacture an upsell. A generic 0–100 score is not the center of the experience, and a partially evidenced result must not be labeled complete or scored as observed failure. `AUDIT_STANDARD.md` and `SCORING_MODEL.md` record the presentation boundary. This does not resolve the conflicting audit:G1 ratification statements above, implement the engine, or authorize connections and customer data ingestion. The first-party G1.5 evidence review must challenge applicability, provenance, coverage, and release claims before a publication gate is ratified.

## ADR-022 — Standard free audit has zero metered AI/API usage
**OWNER-APPROVED PRODUCT INVARIANT (2026-09-13); free engine and release gate NOT IMPLEMENTED.** A standard free Audit must produce baseline-derived Genome, applicable deterministic findings, priorities, OS/agent recommendations and templated report with **$0 incremental metered AI/API usage to 1stStep.ai**. No provider-neutral model worker, paid API, embeddings, search, vendor credit or paid cached output is a required/free fallback. Existing model-worker provisions describe optional paid/internal analysis and cannot run in this free lane. Reviewed versioned deterministic rules/PatternDefinitions and a few user-confirmed answers can supplement local static evidence. Unsupported semantic/business/UX judgments are NOT ASSESSED. Infrastructure cost is tracked separately. Permanent gate `FREE-AUDIT-ZERO-METERED-COST` blocks release if a mandatory metered call is introduced unless Evan explicitly changes the invariant. The G1 ratification conflict above is unaffected.
