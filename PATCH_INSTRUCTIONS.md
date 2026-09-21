# Patch Instructions

Copy this package into:

`C:\Users\evanp\Documents\Claude\Projects\1stStep OS Audit`

Then update `AGENTS.md`, `AUDIT_STANDARD.md`, and the audit orchestrator to reference:
- `CONTINUATION_PROTOCOL.md`
- `workflows/PAUSE_AND_RESUME.md`
- `workflows/AUDIT_QUEUE.md`

For every active audit, create a durable run-state file such as:

`state/runs/<run-id>.json`

When Claude reaches a usage limit, the last safe action should be to checkpoint that file.

When usage resets, start a new Claude session and run:

`prompts/CLAUDE_RESUME_AUDITS.md`

If an external scheduler/runner is later added, it may invoke the resume prompt after a trustworthy provider reset time, but the Project OS must never guess reset timing.
