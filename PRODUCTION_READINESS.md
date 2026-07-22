# Production Readiness Gate

Complete this gate in a separate staging environment before entering real salary data.

## Render services and secrets

- Deploy both `bawjiase-payslip-platform` and `bawjiase-payslip-worker` from `render.yaml`.
- The web service runs `python predeploy.py` before release. Deployment is blocked unless production configuration is safe, PostgreSQL is reachable, and schema migrations succeed.
- Render checks `/api/readiness`, which requires PostgreSQL plus a recent external-worker heartbeat. `/api/health` remains the lower-level diagnostic endpoint.
- Confirm `/manifest.json`, `/sw.js`, `/offline.html`, and all `/icons/bcb-finance-*.png` files return HTTP 200 over the final Render HTTPS domain. Install the app on one managed Android phone and one managed iPhone, then verify the BCB icon, standalone launch, logout, session timeout, update behavior, and offline warning.
- Set independent Fernet values for `DATA_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY`, and `BACKUP_ENCRYPTION_KEY`.
- Give the web and worker the same data-encryption key and SMTP values.
- Set `MAIL_DEFAULT_SENDER`, `PASSWORD_RESET_BASE_URL`, `ALLOWED_ORIGINS`, and a long random `DELIVERY_WEBHOOK_SECRET`.
- Keep `REQUIRE_POSTGRESQL=true`, `FORCE_HTTPS=true`, `PAYSLIP_WORKER_MODE=external`, and `REQUIRE_MALWARE_SCANNER=true`.
- Keep `VALIDATE_PRODUCTION_CONFIG=true` and `ALLOW_SELF_REGISTRATION=false`; unsafe production configuration must stop startup.
- Confirm Settings → Security reports HTTPS, encryption, SMTP, webhook, malware scanning, and the dedicated worker as Ready.

## Delivery verification

- Prepare a payroll named `STAGING ...` or `[STAGING] ...` containing only approved synthetic recipients. Store its ID, exact recipient allowlist, and test recipient in the GitHub `staging` environment secrets.
- Run **Approved Staging Payslip Delivery** first with 10 recipients and then with 100 or 500 recipients. The workflow refuses unapproved addresses, duplicate recipients, non-staging batch names, missing MFA, and any count mismatch.
- Use `delivery` mode only when provider webhooks are configured because every record must reach provider-confirmed `Delivered`. Use a separate controlled batch with `bounce-retry` mode to prove Failed/Bounced tracking, retry attempts, and immutable status history.
- Configure the mail provider or a small provider adapter to POST signed delivery/bounce events to `/api/email-delivery/webhook` with `X-Delivery-Webhook-Secret`. The endpoint accepts one event or an `events` array, maps `delivered`/`delivery` and `bounce`/`bounced`/`dropped`/`blocked`, and can match `deliveryId` or the stored `messageId`.
- Send a 10-user dummy batch, then a 100–500-user dummy batch using non-production recipients.
- Confirm no message exposes another staff address and each PDF belongs to its recipient.
- Confirm failed records can be retried separately and delivered/bounced events update the final summary.
- The automated SMTP service gate sends ten separate synthetic messages and verifies that every message has exactly one recipient, one individual PDF, no BCC header, and no other recipient address.
- Restart the worker while records are pending and verify they resume without duplicate sends.

## Security and recovery

- Test all six bank roles against every protected route and API operation.
- The backend test suite enforces the complete seven-role matrix, including the isolated Boss Admin control plane. The staging acceptance workflow repeats non-destructive allow/deny checks using dedicated staging accounts.
- Verify account lockout, password reset expiry, inactivity logout, CSRF rejection, and MFA enrollment.
- Upload a harmless antivirus test file in staging and confirm the upload is blocked.
- Download an encrypted backup, restore it into staging, and compare staff, payroll, audit, and delivery totals.
- Configure `STAGING_POSTGRES_DATABASE_URL` with a staging-only database credential that can create a disposable restore database. Run **Approved Staging Recovery Drill**, enter `RESTORE STAGING`, and retain the successful workflow record with the launch evidence.
- Review response security headers and run an approved vulnerability scan before board acceptance.
- Review weekly CodeQL findings and manually run **Approved Staging Security Scan** against the approved HTTPS staging deployment; resolve the OWASP ZAP report before real salaries are introduced.
- Run `python scripts/postgres-recovery-drill.py` with `TEST_POSTGRES_DATABASE_URL` pointing only to an approved test/staging database. The drill creates and removes a disposable restore database and compares SHA-256 content hashes without printing records.
- Forward JSON `api_request`, `payslip_delivery_failed`, and `payslip_delivery_bounced` events to restricted monitoring and alert on repeated failures.
- Configure `MONITORING_TOKEN` in Render and `PRODUCTION_BASE_URL` plus `PRODUCTION_MONITORING_TOKEN` in the protected GitHub `production` environment. Run **Production Monitoring** manually once, then confirm its 15-minute schedule can open and close the scoped operational alert issue.

## Device acceptance

- Test current Chrome, Edge, Firefox, Android Chrome, and iOS Safari.
- Check login, registration, staff import, payroll entry, approval, preview, sending, reports, users, and settings at phone, tablet, laptop, and large-desktop widths.
- Record approver sign-off, test date, build commit, and any accepted exceptions.

## Approved staging acceptance workflow

1. In the GitHub `staging` environment, configure `STAGING_BASE_URL` with the Render HTTPS URL.
2. Configure `STAGING_ROLE_CREDENTIALS_JSON` with dedicated synthetic accounts for `SuperAdmin`, `Admin`, `FinanceOfficer`, `FinanceApprover`, `Auditor`, `Management`, and `BossAdmin`. Each entry needs `email` and `password`. Privileged roles must also contain the Base32 `mfaSecret`; the workflow generates the short-lived authenticator code at runtime and never prints it.
3. Run **Approved Staging Acceptance** from GitHub Actions after Render reports both services deployed.
4. The workflow verifies HTTPS security headers, PostgreSQL, the external worker, completed privileged-role MFA enrollment, disabled registration, invalid-webhook rejection, CSRF enforcement, login/logout, and the role matrix without changing payroll data.
5. Run **Approved Staging Security Scan** and the PostgreSQL recovery drill separately. Recovery is intentionally restricted to databases whose names include `test`, `staging`, or `drill`.

## MFA enrollment and lost-device acceptance

1. Enroll Super Admin, Admin, Finance Officer, Finance Approver, and Boss Admin from **My Profile → Authenticator security** using separate named staging accounts.
2. Store each account's recovery codes in the bank-approved password manager; never place recovery codes in source control or ordinary email.
3. Confirm an authenticator code is required at the next login. The staging acceptance workflow independently verifies all five privileged roles with short-lived codes generated from staging-only secrets.
4. Test one recovery code on a staging account and confirm the same code cannot be reused.
5. Test the **Reset MFA** action for a non-BossAdmin staging user, confirm all of that user's sessions are revoked, and require fresh enrollment. Boss Admin remains isolated and must use its own recovery code and profile controls.
