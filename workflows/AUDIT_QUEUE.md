# Audit Queue

## Purpose

Support multiple projects being audited sequentially across many AI sessions.

Each queued project records:
- queue ID
- priority
- target
- audit mode
- run ID
- baseline ID
- state
- current domain
- next action
- dependency/blocker
- last checkpoint
- optional `resume_not_before`

## Scheduling rule

When invoked:
1. continue an already-running/resumable audit before starting a new audit, unless priority/owner instruction says otherwise
2. skip audits with unresolved hard blockers
3. never create a duplicate audit run for a target merely because the previous AI session ended
4. when one project completes, checkpoint and proceed to the next queued target if budget/context permits
