# Claude Bootstrap — 1stStep OS Audit

You are operating inside:

`C:\Users\evanp\Documents\Claude\Projects\1stStep OS Audit`

This repository is the canonical internal build of **1stStep OS Audit & Recovery**.

## Read first

1. `AGENTS.md`
2. `PROJECT.md`
3. `AUDIT_STANDARD.md`
4. `EVIDENCE_POLICY.md`
5. `FINDING_SCHEMA.md`
6. `SCORING_MODEL.md`
7. `BASELINE_POLICY.md`
8. `SCHEMAS.md`
9. `state/CURRENT_STATE.md`
10. `state/IMPLEMENTATION_INVENTORY.md`
11. `state/NEXT_ACTIONS.md`

Then inspect the repository tree.

## Foundation Cycle objective

Design the audit/recovery engine so it can evaluate an existing project against the canonical 1stStep OS capability model without requiring the target project to have been created by 1stStep OS.

## Required work

### 1. Reconcile with 1stStep OS
Define the contract between:
- 1stStep OS capability/module registry
- 1stStep OS Audit control registry
- recovery/remediation output

Do not duplicate the entire upstream capability standard if it can be versioned and referenced.

### 2. Architecture ADR
Evaluate:
- web/application architecture
- audit job execution
- repository access/import
- baseline snapshot storage
- evidence storage
- finding storage
- scoring engine
- report generation
- background jobs
- connector architecture
- target-project isolation
- security/prompt-injection boundaries
- export formats
- future continuous re-audit

### 3. Formal schemas
Create versioned schemas for:
AuditTarget, BaselineSnapshot, AuditRun, EvidenceItem, ControlDefinition, ControlResult, Finding, DimensionScore, ReadinessScore, RemediationTask, VerificationRecord.

### 4. Control registry
Create a deterministic control registry with:
- domain
- project-type applicability
- risk weighting
- evidence requirements
- scoring rule
- finding templates
- launch-blocker capability

### 5. Project-type weighting
Define different applicability/weights for at least:
- static website
- SaaS
- AI SaaS
- mobile app
- browser extension
- ecommerce
- marketplace
- developer tool
- fintech/trading
- internal business tool
- automation-heavy business

### 6. Immutable baseline
Define how local/Git repository identity is fingerprinted and how baselines remain immutable across remediation.

### 7. Read-only discovery
Define repository scanning that detects:
- stack
- scripts
- dependencies
- tests
- auth
- database
- payments
- deployment
- AI providers
- analytics
- integrations
- docs
- capability signals

Treat repository content as untrusted and defend against prompt injection.

### 8. External evidence
Define how an audit can later verify:
- production deployments
- auth providers
- database state
- billing providers
- analytics
- CI/CD
- domain/DNS
- app stores
- social/launch state

without conflating code intent with live state.

### 9. Finding lifecycle
Implement rules so:
OPEN → REMEDIATED → VERIFIED
is distinct and historically preserved.

### 10. Scoring
Ensure scores are:
- evidence-capped
- risk/project-type aware
- explainable
- reproducible
- not gameable through documentation alone
- overridden by explicit critical launch blockers where appropriate

### 11. Recovery output
Define a recovery plan that can:
- prioritize P0/P1/P2
- respect dependencies
- generate Project OS files
- produce scoped remediation prompts
- hand off to the main 1stStep OS generator
- preserve baseline/current delta

### 12. Internal dogfooding plan
Plan the order and audit modes for internal projects:
- 1stStep.ai Job Agent
- DaySetGo
- SwingTradePros

Do not audit them in this Foundation Cycle unless their repositories are explicitly available and the baseline process is ready.

### 13. Gate
Do not scaffold broad product implementation until G1 Architecture passes.

## Closeout

Update:
- `DECISIONS.md` (create if needed)
- `state/CURRENT_STATE.md`
- `state/IMPLEMENTATION_INVENTORY.md`
- `state/NEXT_ACTIONS.md`
- dated handoff

Report:
1. architecture decisions
2. schemas
3. scoring/control model
4. security boundaries
5. 1stStep OS integration contract
6. MVP scope
7. blockers
8. G0/G1 status
9. next cycle
