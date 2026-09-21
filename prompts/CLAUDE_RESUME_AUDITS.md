# Claude — Resume Interrupted 1stStep OS Audits

You are operating in the canonical 1stStep OS Audit repository.

First read:
1. `AGENTS.md`
2. `CONTINUATION_PROTOCOL.md`
3. `workflows/PAUSE_AND_RESUME.md`
4. `workflows/AUDIT_QUEUE.md`
5. all active audit-run state/checkpoint files
6. the applicable target baseline and audit authority

## Objective

Continue existing interrupted audit runs from their persisted checkpoints.

## Rules

- Do NOT create a new audit run merely because this is a new Claude session.
- Do NOT regenerate immutable baselines unless the existing baseline is invalid for the current target state.
- Do NOT repeat completed domains solely to regain context.
- Preserve finding IDs.
- Preserve baseline scores/history.
- Continue from the exact `next_action`.
- If the target repository changed since baseline, record the change and follow the delta/baseline policy instead of silently mixing states.
- After each meaningful atomic unit, update the checkpoint.
- If usage becomes constrained again, checkpoint and exit cleanly.

## Queue behavior

If multiple audits are incomplete:
1. continue the highest-priority resumable audit
2. finish it or reach a real blocker
3. then move to the next queued audit if capacity remains

## End condition

When no incomplete resumable audits remain, report:
- audits completed
- audits still blocked
- current scores
- open critical/high findings
- recommended next remediation/audit step
