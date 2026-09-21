# Next Actions

## Owner decisions
1. **Self-audit RUN-0001:** finalize as-is (permanent baseline, with notes), or discard the unfinalized draft, fix finding wording (registry 0.1.1) and re-baseline. Recommended: fix and re-baseline, since nothing is finalized yet.
2. First commit of this repository (gives the next baseline STRONG identity).
3. Confirm who owns concurrent edits to DECISIONS.md / AUDIT_STANDARD.md / SCORING_MODEL.md / ARCHITECTURE.md (ADR-021/022) so sessions don't overlap.

## Engine fixes found by the self-audit
1. Lifecycle-aware finding wording: ABSENT → "Not implemented: <control>" with launch-requirement impact; PARTIAL/exploit wording only when evidence shows a live defect. Version the registry to 0.1.1 and add a golden test.
2. Evidence granularity: one absence item per capability instead of a shared catch-all.
3. Report note for detector false positives; `osaudit discard-draft` for unfinalized runs (recorded in ledger, never for finalized runs).

## Cycle 2 — Execution + verification
1. Docker sandbox executor (`osaudit execute`): typecheck/tests/secret scan/dependency audit as COMMAND_OUTPUT/TEST_EXECUTION E4 (would move CODE_QUALITY-001, TESTING_QA-001, SECURITY-001/002 out of unknowns).
2. `osaudit plan` (RemediationTasks + RecoveryPlan + prompts) and `verify`/`reaudit` with VerificationRecords.
3. Port `tools/validate_foundation.py` users (docs) to `npm run check` + `osaudit lock --update`, then delete the Python tool.
4. SARIF/CSV export; zero-metered-cost check for the free lane (ADR-022).

## Later
- Hosted app, connectors, dogfood DaySetGo → SwingTradePros → Job Agent (`DOGFOODING_PLAN.md`).
