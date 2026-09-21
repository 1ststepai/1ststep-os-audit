# G1.6 local deterministic free-audit engine review — 2026-09-13

Status: **local provisional foundation; production CLOSED**. The bounded free lane is not a finalized customer AuditRun, a readiness score, or a public funnel. It consumes the existing Audit control registry and upstream lock, without replacing their authority. No app-owned target was changed.

## 1. MVP rules and 2. deferred inventory

The exact 12 `free.*@0.1.0` contracts, with the required 17 fields each, are in `.project-os-audit/free-rules.json`. The selected detectors are `git-identity`, `dirty-overlay`, `agent-authority`, `decision-record`, `release-doc`, `test-script`, `ci-workflow`, `tracked-env`, `html-title`, `html-canonical`, `html-lang`, `html-main`. Git/CI/governance observations do not automatically constitute defects; absent conventional governance filenames are now SKIPPED rather than findings. Only tracked credential-named *paths*, missing substantive root test scripts, and bounded static root HTML omissions may emit provisional findings. No claims about live runtime, deployment, secret validity, ranking or WCAG conformance.

Each of the 15 G1.5 inventory rows has a disposition:

| G1.5 candidate | Roadmap | Why |
| --- | --- | --- |
| Live CTA route and destination | IMPLEMENT AFTER PARSER/TOOLING | Needs allowlisted URL probe, release identity and redirect chain. |
| Web metadata and landmarks | IMPLEMENT NOW (bounded source); IMPLEMENT AFTER PARSER/TOOLING (rendered) | Four conservative static `index.html` checks now; parser/rendered coverage later. |
| Source-to-live deployment identity | USER INPUT REQUIRED | Provider access, project/alias ownership and permission required. |
| Git branch/commit/dirty overlay | IMPLEMENT NOW | Captured read-only; dirt is context, not severity. |
| Protected-route authorization | IMPLEMENT AFTER PARSER/TOOLING | AST route graph, policy/test mapping and independent validation needed. |
| Worker/receipt/billing continuity | USER INPUT REQUIRED | Authenticated provider and receipt authority needed. |
| Resume landing origin discrepancy | USER INPUT REQUIRED | Owner must choose canonical source/deployment identity. |
| Partner brand asset | IMPLEMENT AFTER PARSER/TOOLING | Approved asset hash and deployed/rendered identity required. |
| Referral attribution/commission | USER INPUT REQUIRED | Provider ledger and contract scope; not a generic free repository finding. |
| OS schema/registry/authority conformance | IMPLEMENT AFTER PARSER/TOOLING | Existing validator passes; arbitrary target commands need sandbox/allowlist. |
| Non-Git OS identity | IMPLEMENT NOW | WEAK local identity, no fabricated commit or fault inference. |
| Audit upstream hash-lock drift | IMPLEMENT NOW | Existing `loadContracts` verifies hashes; reviewer authorization separate. |
| G1 ratification conflict/unborn HEAD | USER INPUT REQUIRED | Deterministic conflicting text/HEAD fact, but owner resolves authority; not auto-adjudicated. |
| Nuanced strategy/architecture/UX | PAID-ONLY INTELLIGENCE | Human/optional authorized reasoning, never required free inference. |
| Vanity activity/repository-size health | REJECT | No reliable outcome proxy. |

Client-exposed key placement, authorization bypass, headings hierarchy, JSON-LD correctness, robots contradictions, E2E expectation and performance require parsed/configured project context. They are **not** claimed by this MVP. Path-only `tracked-env` is a review candidate, not a content secret scan.

## 3. Architecture and 4–6. contracts

`free-cli.ts` enforces the cost gate and outside-target output → `free-engine.ts` loads versioned registry and pinned controls → `capture.ts` takes filtered local source snapshot, Git metadata and manifest **without Git history bundle** → `discover.ts` produces canonical validated inventory/evidence → rules emit canonical validated EvidenceItem/Finding with deterministic text → severity/ID sorting and registry-backed capability refs → cost/fingerprint/result written once outside the target. Unsupported source conditions are SKIPPED with reasons. No score, finalization, provider connection, model worker, target mutation or target command execution.

`baselineIdentity` exact fields: `projectId`, `repositoryIdentity` (credential-sanitized remote or local path), `branch|null`, `commitSha|null`, `capturedAt`, `auditEngineVersion`, `ruleSetVersion`, `baselineId`, `identityStrength` (`LOCAL_GIT|WEAK_NON_GIT`). Canonical BaselineSnapshot additionally holds `fingerprint` (VCS, dirty counts, content-manifest/exclusions/integrity), filtered `storage`, `inventory`, and read-only command evidence. A non-Git/unborn source has no invented SHA.

`evidenceViews[]` exact fields: `evidenceId`, `kind`, `path|null`, `lineStart|null`, `lineEnd|null`, `configKey|null`, `commandId|null`, `repositoryMetadata|null`, `testResult|null`, `ruleOutput`, `timestamp`, `redacted`. The canonical EvidenceItem carries claim/source/strength/state/polarity, scope, locator and search coverage. Optional line/config/test fields are null until a detector supplies them. Excluded `.env`/credential-named content is never captured; its filename can be evidence. Arbitrary unrecognized secrets inside ordinary source remain a privacy risk requiring further guardrails before customer ingestion.

`findingViews[]` exact fields: `findingId`, `projectId`, `baselineId`, `ruleId`, `ruleVersion`, `domain`, `severity`, `confidence`, `confidenceBasis`, `title`, `explanation`, `whyItMatters`, `evidenceRefs`, `remediationClass`, `status`, `createdAt`. They project from schema-validated canonical Findings (control/template, fingerprint, evidence state/strength, surface, history). The view is deliberately not a second finding authority; the rule result joins its provenance. Neither an absent filename nor a source-only HTML check proves a live defect.

## 7–10. recommendation, gate, accounting and cache

Priorities are classes `HIGH`, `LOW`, `INFO` for currently emitted findings, stable sorted by severity then finding ID. `BLOCKER` and `MEDIUM` remain reserved until independently verified rule/evidence logic supports them. Security → Security Auditor; deployment/release and testing → Independent Audit Agent; documentation/authority → Lead Engineer / Orchestrator; accessibility → Accessibility Agent; SEO → Discovery Agent; future performance → Performance Agent. Every recommendation carries canonical `capabilityId`, finding IDs and a rationale; no findings means no recommendation.

`FREE-AUDIT-ZERO-METERED-COST` is executed by `npm run check`: static CI-reachable import graph from the free CLI, explicit dependency/lock denylist, provider env-key/endpoint checks, network built-in/call and dynamic-import rejection, child-process restriction to reviewed Git calls. Negative tests inject OpenAI SDK, provider config, network/dynamic calls and curl; runtime test replaces fetch/HTTP(S)/TCP/TLS with throws. The reachable graph has only approved Ajv external import; CLI fails closed before capture if policy fails. This proves the tested path's **$0.00 incremental metered AI/API usage**, not $0 infrastructure cost or complete resistance to intentionally obfuscated code. Policy/scan need security review before release.

`cost` exact fields: `filesProcessed`, `bytesProcessed`, `runtimeMs`, `peakMemoryBytes` (process RSS, not per-audit peak isolation), `cpuDurationMs`, `storageUsedBytes|null`, `networkBytes`, `cacheHits`, `cacheMisses`, `externalPaidApiCost` (USD 0), `currency`, `instrumentation`. Storage remains unknown rather than zero. Fingerprint is SHA-256 of project/permission scope, normalized repository identity or local path, SHA/branch where present, **content manifest including dirty state**, engine and rule-set versions + individual rule versions, upstream lock and `LOCAL_OFFLINE` scope. No cross-tenant reuse or cache implementation yet; freshness and authorization must be checked on future cache reads.

## 11–12. Dogfood and false-positive review

Read-only source capture, result and store outside every target under `C:\Users\evanp\.osaudit-g16-20260913-v3`. This is local source identity only; subfolders for resume/partners are not verified live deployment repositories. The six-target run has no observed candidate defects; it therefore does **not** prove the rule set useful on real defects. Synthetic fixture confirms that tracked credential-named path, missing test script, source SEO and language gaps can yield validated findings with no network egress.

| Target/source | Identity and applicable/skipped rules | Provisional findings | Limits |
| --- | --- | --- | --- |
| `1ststep.ai` / `main-website-os-onboarding-20260913` | Git `b95bf7c`; 11/1 | 0 | No source-to-live SHA/probe. |
| `app.1ststep.ai` / `partners-hardening-main-20260909` | Git `2e16ec3`; 11/1 | 0 | Source candidate only; active app ownership and production unassessed. |
| `resume.1ststep.ai` / `resume-focus-20260909/resume-tailor-landing` | nested non-Git adapter; 0/12 | 0 | Canonical origin unverified; unsupported live audit. |
| `partners.1ststep.ai` / `partners-hardening-main-20260909/partners-landing` | nested non-Git adapter; 4/8 | 0 | Parent authority and live mapping unverified. |
| root `1stStep OS` | non-Git WEAK; 4/8 | 0 | No durable commit identity. |
| root `1stStep OS Audit` | unborn Git HEAD as non-Git WEAK; 3/9 | 0 | Own source concurrent/uncommitted; not a sealed self-audit. |

False-positive adjudication by rule: `git-identity`, `dirty-overlay`, `ci-workflow` = RELIABLE scoped observation, not defect; `tracked-env` = RELIABLE filename signal but REQUIRES USER CONFIRMATION for secret validity; `agent-authority`, `decision-record`, `release-doc` = TOO NOISY as absence findings, refined to SKIPPED/UNKNOWN; `test-script` = NEEDS REFINEMENT for monorepo/external tests, now recognizes `test:*`; `html-title`, `html-canonical`, `html-main` = ENVIRONMENT-SPECIFIC, source-only and parser/rendered check required before production release; `html-lang` = RELIABLE static source only, rendered state unknown. No rule is approved as customer-ready; all registry rows remain `PROVISIONAL_DOGFOOD`.

## 13–17. provenance, governance, checks, blockers, decision

Upstream lock verdict **ACCEPTABLE WITH RISK for local validation only; UNVERIFIED as owner ratification**. `upstream-lock.json` reports capture `2026-09-13T19:35:11Z`, 20 pinned upstream files; current file hashes independently reproduce and both validator paths pass. `tools/validate_foundation.py --update-lock` exists but was **not run** in G1.6. No committed Audit history or producer/reviewer record establishes who changed the lock or approved the dependency set; `DECISIONS.md` and state contain contradictory G1 ratification assertions. Do not promote this lock to trusted release provenance without owner review and a durable source commit. No history rewritten or lock bumped.

Root OS has no Git repository; root Audit has initialized `main` but no commits/remote. This is a governance/rollback risk for architectural authorities, not automatic evidence of broken product. Owner should choose private versioned repositories or a reviewed parent-repository boundary, retain exact source snapshots and change review, then commit only after ownership and secrets review. No repository initialized, published or rewritten here.

Verified: Audit `npm run check` typecheck + 20/20 tests + static zero-cost gate PASS (10 reachable modules); `python tools/validate_foundation.py` PASS (15 Audit schemas, 20 upstream schemas, 52 controls, 11 profiles); root OS `npm run check` 10/10 PASS. Six CLI dogfood runs completed with external paid API cost 0 and no target writes. No public-site build repeated this cycle; prior passing status is inherited, not a new test. No production deployment.

Blockers: real-defect first-party usefulness and parser/rendered checks not proven; source-to-live and resume/partner identity unknown; weak/unborn root version history; upstream reviewer provenance unknown; arbitrary secret protection, storage/retention limits, full runtime metering and negative fallback tests need hardening. Recommendation: **G1.6 local foundation verified, but not customer-ready; proceed only to a bounded next engine accuracy/security cycle, not a funnel or production release.**
