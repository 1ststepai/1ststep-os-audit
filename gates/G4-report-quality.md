# G4 — Report Quality

## Purpose
Findings, evidence, scores, blockers and remediation links validate.

Result: `PASS | BLOCKED | NOT_APPLICABLE`

## Standard free-result cost check (ADR-022)

For a standard free Audit report, `FREE-AUDIT-ZERO-METERED-COST` is a separate permanent release gate. It is **NOT_EVALUATED** today: a PASS requires instrumented end-to-end evidence that Genome, assessment, prioritization, OS/agent recommendations and templated report complete with zero incremental metered AI/API use, including error and fallback paths. Dependency/call-boundary tests must fail if a metered provider is introduced. Infrastructure cost and abuse limits are measured separately; missing telemetry is BLOCKED, not zero. A free result that depends on usage-priced inference blocks release unless Evan changes the invariant. Report quality cannot imply that this gate passed.
