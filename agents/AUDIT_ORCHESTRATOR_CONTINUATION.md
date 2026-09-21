# Audit Orchestrator — Continuation Requirements

The audit orchestrator must be interruption-safe.

## Before each domain/unit
Know:
- run ID
- baseline ID
- finding counter/state
- exact unit being executed

## After each domain/unit
Persist:
- result
- evidence pointers
- findings
- score contribution
- next action
- updated queue state

## If usage is exhausted
Do not attempt to "push through."
Write the checkpoint and return:

`PAUSED_USAGE_LIMIT — safe to resume`

Do not state that the audit is complete.

## On restart
Resume from state files, not from recollection or chat history.
