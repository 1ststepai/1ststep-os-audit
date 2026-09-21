# Pause & Resume Workflow

## Pause triggers

### Provider usage limit
Set:
`status = PAUSED_USAGE_LIMIT`

### Rate limit
Set:
`status = PAUSED_RATE_LIMIT`

If a retry/reset timestamp is explicitly returned, record it in `resume_not_before`.
Otherwise leave it null.

### Context exhaustion risk
Before the context becomes unsafe:
- compact durable state
- checkpoint
- set `PAUSED_CONTEXT_LIMIT`

### User pause
Set `PAUSED_USER`.

### Unexpected failure
Set `PAUSED_ERROR` with error classification and last safe checkpoint.

## Resume procedure

When a new Claude/agent session starts:

1. Read `AGENTS.md`.
2. Read continuation protocol.
3. Locate all non-completed run-state files.
4. Prefer the explicitly requested run; otherwise continue the oldest/highest-priority resumable run according to the audit queue.
5. Validate baseline fingerprint.
6. If target changed:
   - do not silently resume against a different baseline
   - determine whether a new delta snapshot is required
7. Resume `next_action`.
8. Do not repeat finished units merely to reconstruct context.
9. Update checkpoint after each meaningful atomic unit.

## Completion

Only set `COMPLETED` when all selected audit domains and report-closeout requirements are complete.
