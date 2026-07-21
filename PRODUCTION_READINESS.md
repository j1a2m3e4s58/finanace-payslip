# Production Readiness Gate

Complete this gate in a separate staging environment before entering real salary data.

## Render services and secrets

- Deploy both `bawjiase-payslip-platform` and `bawjiase-payslip-worker` from `render.yaml`.
- Set independent Fernet values for `DATA_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY`, and `BACKUP_ENCRYPTION_KEY`.
- Give the web and worker the same data-encryption key and SMTP values.
- Set `MAIL_DEFAULT_SENDER`, `PASSWORD_RESET_BASE_URL`, `ALLOWED_ORIGINS`, and a long random `DELIVERY_WEBHOOK_SECRET`.
- Keep `REQUIRE_POSTGRESQL=true`, `FORCE_HTTPS=true`, `PAYSLIP_WORKER_MODE=external`, and `REQUIRE_MALWARE_SCANNER=true`.
- Keep `VALIDATE_PRODUCTION_CONFIG=true` and `ALLOW_SELF_REGISTRATION=false`; unsafe production configuration must stop startup.
- Confirm Settings → Security reports HTTPS, encryption, SMTP, webhook, malware scanning, and the dedicated worker as Ready.

## Delivery verification

- Configure the mail provider or a small provider adapter to POST signed delivery/bounce events to `/api/email-delivery/webhook` with `X-Delivery-Webhook-Secret`. The endpoint accepts one event or an `events` array, maps `delivered`/`delivery` and `bounce`/`bounced`/`dropped`/`blocked`, and can match `deliveryId` or the stored `messageId`.
- Send a 10-user dummy batch, then a 100–500-user dummy batch using non-production recipients.
- Confirm no message exposes another staff address and each PDF belongs to its recipient.
- Confirm failed records can be retried separately and delivered/bounced events update the final summary.
- Restart the worker while records are pending and verify they resume without duplicate sends.

## Security and recovery

- Test all six roles against every protected route and API operation.
- Verify account lockout, password reset expiry, inactivity logout, CSRF rejection, and MFA enrollment.
- Upload a harmless antivirus test file in staging and confirm the upload is blocked.
- Download an encrypted backup, restore it into staging, and compare staff, payroll, audit, and delivery totals.
- Review response security headers and run an approved vulnerability scan before board acceptance.
- Review weekly CodeQL findings and manually run **Approved Staging Security Scan** against the approved HTTPS staging deployment; resolve the OWASP ZAP report before real salaries are introduced.
- Run `python scripts/postgres-recovery-drill.py` with `TEST_POSTGRES_DATABASE_URL` pointing only to an approved test/staging database. The drill creates and removes a disposable restore database and compares SHA-256 content hashes without printing records.
- Forward JSON `api_request`, `payslip_delivery_failed`, and `payslip_delivery_bounced` events to restricted monitoring and alert on repeated failures.

## Device acceptance

- Test current Chrome, Edge, Firefox, Android Chrome, and iOS Safari.
- Check login, registration, staff import, payroll entry, approval, preview, sending, reports, users, and settings at phone, tablet, laptop, and large-desktop widths.
- Record approver sign-off, test date, build commit, and any accepted exceptions.
