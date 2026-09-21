# Budget-Aware Continuation & Resume Protocol

## Purpose

Long-running audits/builds must survive:
- Claude/AI usage limits
- provider rate limits
- context-window exhaustion
- process interruption
- local machine restart
- network failure
- user-requested pause
- scheduled continuation

The system must never require restarting completed work simply because an AI session ended.

## Core principle

> Provider sessions are disposable. Workflow state is durable.

## Continuation states

- `RUNNING`
- `CHECKPOINTING`
- `PAUSED_USAGE_LIMIT`
- `PAUSED_RATE_LIMIT`
- `PAUSED_CONTEXT_LIMIT`
- `PAUSED_USER`
- `PAUSED_ERROR`
- `RESUME_READY`
- `COMPLETED`
- `BLOCKED`

## Required behavior

Before any likely session/usage exhaustion:
1. finish the smallest safe atomic unit
2. persist completed work
3. persist outstanding work
4. persist current target/project/domain
5. persist exact next action
6. persist verification already performed
7. persist finding IDs already allocated
8. persist hashes/versions of relevant baselines
9. persist provider/session reason for pause
10. exit without marking unfinished work complete

On next invocation:
1. read canonical authority
2. read current run state
3. validate target/baseline has not changed unexpectedly
4. resume from `next_action`
5. do not repeat completed audit units unless verification requires it
6. append new evidence rather than overwriting baseline history

## No-reset rule

Usage exhaustion must never cause:
- a new audit ID
- duplicate findings
- repeated immutable baseline creation
- score history overwrite
- duplicate repository-wide scans without need
- loss of remediation state
