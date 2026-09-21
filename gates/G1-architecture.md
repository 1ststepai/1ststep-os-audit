# G1 — Architecture

## Purpose
Audit engine architecture, schemas, evidence, scoring and baseline storage are accepted.

Result: `PASS | BLOCKED | NOT_APPLICABLE`

## Criteria
| ID | Criterion | Evidence |
|---|---|---|
| C1 | Architecture ADR covers all 14 required areas + MVP scope | `ARCHITECTURE.md`, ADR-006…020 |
| C2 | 11 required schemas (+ registry, profiles, plan) exist, valid JSON Schema 2020-12 | `schemas/audit/0.1.0/*`, validator |
| C3 | Deterministic control registry with applicability, weights, evidence reqs, scoring rule, templates, launch blockers; all 33 domains covered; capability refs resolve upstream | `.project-os-audit/controls.json` (52 controls), validator |
| C4 | Project-type weighting for the 11 required types | `.project-os-audit/project-types.json` |
| C5 | Immutable baseline + fingerprint defined | `BASELINE_POLICY.md`, `baseline-snapshot.schema.json` |
| C6 | Evidence model separates intent vs live; doc ceilings enforced | `EVIDENCE_POLICY.md`, `EXTERNAL_EVIDENCE.md` |
| C7 | Scoring evidence-capped, type-aware, explainable, reproducible, blocker override | `SCORING_MODEL.md`, fixture recomputed exactly |
| C8 | Finding lifecycle OPEN→REMEDIATED→VERIFIED distinct & preserved | `FINDING_SCHEMA.md`, validator §6 |
| C9 | Security / prompt-injection boundaries | `SECURITY_BOUNDARIES.md` |
| C10 | Recovery contract + generator handoff | `recovery/RECOVERY_CONTRACT.md`, `INTEGRATION_CONTRACT.md` |
| C11 | Upstream contract pinned; contradictions reconciled | `upstream-lock.json`, `INTEGRATION_CONTRACT.md` §5 |
| C12 | Non-gameability demonstrated | tamper suite: 6/6 violations caught |

Command: `python tools/validate_foundation.py` → PASS.

## Foundation Cycle 0 record
**PASS — ratification PENDING** (2026-09-13). Record: `gates/records/audit-G1-foundation-cycle-0.json`.
Non-blocking open items: implementation language (ADR-007); upstream module registry undefined; upstream schemas still changing (lock will need a deliberate bump).
Scaffolding may start only after the owner ratifies.
