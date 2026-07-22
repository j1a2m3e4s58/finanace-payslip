# Production Monitoring and Alert Response

## One-time configuration

1. Generate a random monitoring token of at least 32 characters. Store it as `MONITORING_TOKEN` on both Render services; never reuse the SMTP or webhook secret.
2. Create a protected GitHub environment named `production`. Restrict its administrators and add `PRODUCTION_BASE_URL` plus the same token as `PRODUCTION_MONITORING_TOKEN`.
3. Keep the repository and workflow artifacts restricted to authorized IT/security personnel.
4. Deploy, allow the first encrypted backup to complete, then manually run **Production Monitoring**.
5. Deliberately use a temporary low staging threshold to prove an alert opens, restore the approved threshold, and prove the alert closes. Do not conduct this exercise in production.

## Signals and defaults

| Signal | Default alert condition | First response |
|---|---|---|
| API/HTTPS | Endpoint unreachable or non-200 | Check Render web service and recent deployment |
| PostgreSQL | Database health false | Stop payroll changes; check Render database/events |
| Worker | Heartbeat older than 90 seconds | Check worker logs/restart; do not resend all |
| Delivery queue | More than 100 pending or any Failed/Bounced | Check provider/credentials/webhook; use failed-only retry after correction |
| Storage | 85% or more used | Preserve evidence; expand capacity or dispose only under policy |
| Backup | No encrypted backup or newest older than 192 hours | Investigate scheduler/storage and perform approved staging restore verification |

Tune thresholds with `MONITORING_MAX_PENDING_DELIVERIES`, `MONITORING_MAX_FAILED_DELIVERIES`, `MONITORING_MAX_STORAGE_PERCENT`, and `MONITORING_MAX_BACKUP_AGE_HOURS`. Threshold changes require approval and an audit/change record.

## Alert handling

1. Acknowledge the failed GitHub workflow/issue and assign an incident owner.
2. Use the workflow artifact and restricted Render logs; do not paste confidential data into GitHub.
3. Determine whether data integrity or delivery privacy is at risk. Pause payroll/email activity when uncertain.
4. Apply the relevant response from the table, verify `/api/readiness`, rerun monitoring, and reconcile delivery/backup evidence.
5. Close only after the automated check recovers and Finance/IT confirm business integrity.
6. Follow the incident policy for material events and record corrective actions.

## Escalation contacts

IT on-call: ____________________  Finance owner: ____________________

Security/privacy: ______________  Render/SMTP provider contact: ____________________

Management escalation: ____________________
