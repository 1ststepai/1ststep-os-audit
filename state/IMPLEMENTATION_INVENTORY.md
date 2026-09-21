# Implementation Inventory

| Area | Status | Where |
|---|---|---|
| Audit philosophy | ACCEPTED | `AGENTS.md`, `AUDIT_STANDARD.md` |
| Domain taxonomy (33) | SPECIFIED | `.project-os-audit/domains.json`, `audits/domains/` |
| Architecture ADR | SPECIFIED (G1 PASS, ratification pending) | `ARCHITECTURE.md`, `DECISIONS.md` |
| Canonical schemas (15) | SPECIFIED + VALIDATED | `schemas/audit/0.1.0/` |
| Upstream integration contract | SPECIFIED + HASH-LOCKED | `INTEGRATION_CONTRACT.md`, `.project-os-audit/upstream-lock.json` |
| Evidence model | SPECIFIED + SCHEMA-ENFORCED | `EVIDENCE_POLICY.md`, `EXTERNAL_EVIDENCE.md` |
| Control registry (52) | SPECIFIED (seed) + VALIDATED | `.project-os-audit/controls.json` |
| Project-type weighting (11) | SPECIFIED + VALIDATED | `.project-os-audit/project-types.json` |
| Scoring model | SPECIFIED + REFERENCE-VERIFIED | `SCORING_MODEL.md`, `.project-os-audit/scoring.json` |
| Finding lifecycle | SPECIFIED + REFERENCE-VERIFIED | `FINDING_SCHEMA.md` |
| Immutable baseline | SPECIFIED | `BASELINE_POLICY.md` |
| Security boundaries | SPECIFIED | `SECURITY_BOUNDARIES.md` |
| Discovery detectors | SPECIFIED | `recovery/DISCOVERY_SPEC.md` |
| Recovery contract | SPECIFIED + REFERENCE-VERIFIED | `recovery/RECOVERY_CONTRACT.md` |
| Dogfooding plan | SPECIFIED | `DOGFOODING_PLAN.md` |
| Conformance check | IMPLEMENTED (temporary) | `tools/validate_foundation.py`, `fixtures/foundation-example.json` |
| Repository scanner | NOT STARTED | |
| Baseline capture / store / ledger | NOT STARTED | |
| Sandbox executor | NOT STARTED | |
| Agent workers | NOT STARTED | |
| Scoring engine (product code) | NOT STARTED | |
| Report generator | NOT STARTED | |
| Recovery planner | NOT STARTED | |
| Verification engine | NOT STARTED | |
| External connectors | NOT STARTED | |
| UI/dashboard | NOT STARTED (post-MVP) | |
