# Integration Contract — 1stStep OS ↔ 1stStep OS Audit

Version 0.1.0 · pinned upstream: 1stStep OS schemas **0.1.0**, capability taxonomy **0.1.0** (`.project-os-audit/upstream-lock.json`).

## 1. Ownership

| Concern | Owner | Audit's relationship |
|---|---|---|
| Capability universe (`capabilityId` = `domain.capability`) | **1stStep OS** (`capability-taxonomy.json`, later `CapabilityRegistry`) | Referenced by ID. Never copied. |
| ProjectProfile fields, product types, lifecycle, risk | **1stStep OS** (`project-profile.schema.json`) | Audit target profile `$ref`s the upstream properties. |
| Applicability condition language | **1stStep OS** (`module-definition.schema.json#/$defs/condition`) | Reused by `$ref` for project-type derivation and control applicability. |
| Evidence state vocabulary, actor, assessment, untrustedText, ids/hashes | **1stStep OS** (`common.schema.json`) | Reused by `$ref`. |
| External action classes / scopes | **1stStep OS** (`EXTERNAL_ACTIONS.md`, `permissions.json`) | Remediation tasks carry `approvalClass`; the audit itself holds only `read`. |
| GateResult, Handoff, (base) Finding | **1stStep OS** | Audit gate records and handoffs conform to upstream schemas; audit Finding exports to upstream Finding. |
| Modules → generated Project OS files | **1stStep OS** module registry + compiler | Audit requests modules; it does not generate OS files. |
| Controls, evidence strength E0–E4, scoring, baselines, finding lifecycle, recovery planning | **Audit** | Upstream may consume these through exports. |

## 2. Binding rules

1. Every `ControlDefinition.capabilityRefs[]` must be an existing upstream capability ID. Until the upstream `CapabilityRegistry` JSON is published, the validator lower-cases the pinned taxonomy (`security.SECRET_SCANNING` → `security.secret_scanning`).
2. Audit schemas reference upstream by `$id` (`https://1ststep.ai/os/schemas/0.1.0/…`). They are resolved from the local upstream checkout and **hash-verified**. Any upstream change fails validation until someone reviews it and runs `--update-lock`.
3. Evidence: `EvidenceItem.state` is exactly the upstream `evidenceState`. `strength` (E0–E4) is an audit extension. `NOT_APPLICABLE` is an **applicability** result, not an evidence state (this reconciles `AGENTS.md`).
4. Gates: audit gates are written `audit:G0…G7`; upstream project gates `os:G0…G7`. Both use upstream `GateResult` with `ratification`.
5. Project types: the 11 audit project types are **derived** from upstream ProjectProfile fields (`.project-os-audit/project-types.json` → `derivation`). The audit does not fork the product-type enum.

## 3. Finding export mapping (audit → upstream `Finding`)

| Audit | Upstream |
|---|---|
| `AUD-0001` | `F-0001` (same number; original ID kept in `source`) |
| `domain` (33 audit domains) | `domain` via mapping: engineering = ARCHITECTURE, CODE_QUALITY, SECURITY, PRIVACY_DATA, AUTH, DATABASE, TESTING_QA, ACCESSIBILITY, DESIGN_UX, PERFORMANCE, AI_EFFICIENCY, OBSERVABILITY, DEPLOYMENT, CONTINUITY, RELEASE_READINESS; business-intelligence = PRODUCT, BUSINESS_MODEL, PRICING, COMPETITORS, LEGAL_READINESS, BILLING_CONTINUITY, MIGRATION_CONTINUITY; growth = BRAND, SEO_CONTENT, SOCIAL, DISTRIBUTION, GROWTH, SALES, ANALYTICS, LOCALIZATION; operations = CUSTOMER_SUCCESS, AUTOMATION, DOCUMENTATION_OS |
| `category` | `controlId` lower-kebab (`ctl-security-002`) |
| `OPEN`, `IN_PROGRESS`, `VERIFIED`, `ACCEPTED_RISK`, `DUPLICATE` | same |
| `REMEDIATED` | `FIXED_UNVERIFIED` |
| `BLOCKED` | `OPEN` (blocker in `impact`) |
| `NOT_APPLICABLE` | `WONT_FIX` with riskAcceptance rationale "not applicable: …" |
| evidence refs | `evidence[]` as upstream `evidenceItem {state, description, ref}` |
| latest PASS VerificationRecord | `verification` |

The mapping is lossy (upstream has no E-strength or history), so the audit record stays authoritative.

## 4. Recovery → generator handoff

`RecoveryPlan.projectOsHandoff` is the only channel:

1. `profileDraftPath` — an upstream **ProjectProfile** (`lifecycleStage: EXISTING_RECOVERY`, `profileVersion: 1`) built from the confirmed audit target profile. Every field uses the assessment pattern; audit facts keep their evidence state, and nothing is upgraded to KNOWN without evidence. It must validate against the pinned upstream schema.
2. `capabilityGaps[]` — capability IDs backed by open findings and their controls.
3. `requestedModules[]` — upstream module IDs. **Empty until the upstream module registry exists** (`modules.json` is `TO_DEFINE_IN_CYCLE_0`). Until then the fallback is `targetFiles[]` (default Project OS core: `AGENTS.md`, `PROJECT.md`, `ARCHITECTURE.md`, `SECURITY.md`, `DECISIONS.md`, `state/CURRENT_STATE.md`, `.project-os/manifest.json`).
4. The generator returns a `ProjectOSManifest`. The user applies it to the target as a remediation task (`PROJECT_OS_DOC`, approval `ASSISTED`). The audit then verifies it with `CTL-DOCUMENTATION_OS-001` (manifest validates, contents match the CURRENT snapshot).
5. `generatorStatus`: `NOT_SENT → SENT → GENERATED → APPLIED_BY_USER | REJECTED`.

## 5. Reconciliation log (this cycle)

| # | Conflict | Resolution |
|---|---|---|
| R1 | Audit had 31 domains, standard lists 33 | Added `CODE_QUALITY`, `ACCESSIBILITY` |
| R2 | `NOT_APPLICABLE` listed as evidence state in audit `AGENTS.md`; absent upstream | Moved to applicability |
| R3 | Both products number gates G0–G7 | `audit:` / `os:` prefixes; upstream GateResult shape |
| R4 | Upstream capabilityId `domain.capability` vs taxonomy upper-case | Lower-case mapping in validator until CapabilityRegistry JSON exists |
| R5 | Upstream Finding (`F-`, `FIXED_UNVERIFIED`) vs audit Finding (`AUD-`, `REMEDIATED`, history, E-strength) | Audit superset + export mapping (§3) |
| R6 | No upstream product type for automation-heavy businesses | Derived from `DATA_PIPELINE`/`BOT`/`AI_AGENT`. **Upstream request:** add an explicit automation-business signal (e.g. a `businessAreas` profile field) |
| R7 | Upstream schemas changed during this cycle (new files, new capabilityId) | Hash lock; the validator fails on drift |

## 6. Upstream requests

1. Publish a `CapabilityRegistry` JSON (lower-case IDs) so the audit can drop the taxonomy mapping.
2. Define the module registry (`modules.json`, `MODULES.md`) so handoffs can request modules.
3. Adopt §3 as the documented Finding interchange, or add optional `evidenceStrength` + `history` upstream.
4. Add an automation-business profile signal (R6).
