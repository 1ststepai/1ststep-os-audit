# G0 — Scope

## Purpose
Audit target/scope/mode are explicit.

Result: `PASS | BLOCKED | NOT_APPLICABLE`

## Criteria (per audit target)
- Target source, identity strength and remote/branch recorded (`AuditTarget`).
- Profile inferred with evidence, project types derived and **user-confirmed** (`profile.confirmation = CONFIRMED`).
- Modes, in-scope and excluded domains (with reasons) set in `AuditRun.scope`.
- Production environments/URLs confirmed before any live probe.
- No `RAISE_DECISION` applicability left unresolved.

## Foundation Cycle 0 record
**PASS** (2026-09-13). Subject: the cycle itself. Scope = design of the audit engine only; no target project audited or modified. Record: `gates/records/audit-G0-foundation-cycle-0.json` (ratification PENDING).
