# Continuation Schema

## AuditRunState

```json
{
  "run_id": "AUDRUN-...",
  "status": "PAUSED_USAGE_LIMIT",
  "target_id": "project-id",
  "baseline_id": "baseline-id",
  "phase": "domain_audits",
  "current_domain": "SECURITY",
  "completed_domains": ["PRODUCT", "ARCHITECTURE"],
  "remaining_domains": ["SECURITY", "TESTING_QA"],
  "completed_units": [],
  "pending_units": [],
  "next_action": "Continue SECURITY control SEC-014",
  "last_completed_finding_id": "AUD-027",
  "verification_state": {},
  "provider": "anthropic",
  "provider_model": "unknown-or-recorded-model",
  "pause_reason": "usage_limit",
  "resume_not_before": null,
  "checkpointed_at": "ISO-8601",
  "checkpoint_version": 1
}
```

## Notes

- `resume_not_before` is optional and must only be populated when the provider/runtime supplies a trustworthy reset/retry time.
- Never guess a reset time.
- `next_action` must be executable and specific.
- `completed_domains` and `remaining_domains` are authoritative workflow state, not prose summaries.
