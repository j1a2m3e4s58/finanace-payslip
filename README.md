# Bawjiase Community Bank Payslip Platform

Responsive React and Flask payroll application for staff records, monthly payroll preparation, maker-checker approval, confidential PDF payslips, private bulk delivery, reports, audit logs, and user access control.

## Local development

```powershell
npm install
pip install -r mail-api/requirements.txt
$env:PORT = "4190"
python mail-api/app.py
```

In another terminal:

```powershell
npm run dev
```

Open `http://localhost:5173`. Local development uses SQLite in `mail-api/data`; production uses PostgreSQL through `DATABASE_URL`.

## Automated testing

Run the backend and service integration suite with:

```powershell
npm run test:backend
npm run test:services
```

Run the complete payroll browser workflow (desktop and mobile) with:

```powershell
npx playwright install chromium
npm run test:e2e
```

The browser suite uses isolated synthetic staff, payroll, PDF, and captured-email data under `.tmp`; it never writes to the normal local database. It verifies staff deactivation/reactivation, maker-checker correction and approval, PDF preview, private bulk delivery, delivery status and post-send revisioning. PostgreSQL integration runs when `TEST_POSTGRES_DATABASE_URL` is configured. GitHub Actions provisions PostgreSQL 17 and executes this production-service gate automatically.

## Required production secrets

Copy `.env.production.example` to `.env.production` and replace every placeholder. Generate independent Fernet keys with:

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Do not reuse encryption keys and never commit `.env.production`. Sensitive settings also support Docker/Kubernetes secret files by setting `NAME_FILE` instead of `NAME` (for example, `MAIL_PASSWORD_FILE`). MFA enrollment remains unavailable until an MFA or data encryption key is configured. Public registration is disabled by default; administrators create accounts from Users & Access.

Provision the isolated platform controller with `BOSS_ADMIN_EMAIL`, `BOSS_ADMIN_NAME`, and `BOSS_ADMIN_INITIAL_PASSWORD`. This Boss Admin can open Portal Control and their own profile only; bank staff, payroll, payslips, delivery logs, reports, notifications, and user administration remain unavailable. The account is intentionally absent from bank User Management. Use a unique secret and rotate it after first production sign-in.

## Checks

```powershell
npm run check
```

This runs ESLint, the production frontend build, database/security/payroll unit tests, and Python imports used by the tests.

Additional release gates:

```powershell
npm run test:a11y
npm run test:load
npm run test:e2e
python scripts/check-production-config.py
```

The accessibility gate scans public sign-in and the principal authenticated pages for serious WCAG violations, verifies keyboard skip navigation, and checks reduced-motion behavior. The load gate uses 2,000 synthetic staff records and never reads real payroll data. The production configuration gate fails without PostgreSQL, independent encryption keys, HTTPS, explicit origins, SMTP, signed delivery webhooks, and fail-closed malware scanning. CI also performs an encrypted PostgreSQL restore into a disposable database and deletes that database after hash verification.

## Staging and production

1. Install Docker and Docker Compose on a controlled server.
2. Put the TLS certificate and private key at `deploy/certs/fullchain.pem` and `deploy/certs/privkey.pem`.
3. Configure `.env.production` with PostgreSQL, encryption, SMTP, origin, and webhook secrets.
4. Start with `docker compose up -d --build`.
5. Verify `https://your-host/api/health`, then test with non-production staff and payroll data.
6. Complete the pilot checklist below before importing real payroll data.

The application container runs Waitress, PostgreSQL stores all application documents transactionally, nginx terminates HTTPS, and a dedicated worker resumes unfinished email deliveries after a restart. Production startup refuses SQLite when `REQUIRE_POSTGRESQL=true`. Keep the app and worker services running together.

### Render deployment

The included `render.yaml` creates a Docker web service, a dedicated background email worker, PostgreSQL, a persistent encrypted-backup/upload disk, and HTTPS enforcement. In Render, create a Blueprint from the repository and enter every value marked `sync: false`. The web and worker must receive the same encryption, SMTP, webhook, origin, and password-reset settings. Both processes now validate production configuration before starting. Generate valid independent Fernet keys before the first deployment. Set `ALLOWED_ORIGINS` and `PASSWORD_RESET_BASE_URL` to the final Render HTTPS URL. Public self-registration remains disabled. Do not import real staff or payroll information until the health check passes and SMTP, reset email, upload protection, PDF generation, delivery retry, and backup restore have been tested in staging.

Install and update the malware scanner used by `MALWARE_SCANNER_COMMAND` (the supplied container installs ClamAV). Production uploads fail closed when the configured scanner is unavailable. Schedule signature updates on the host or rebuild the container regularly.

### Install on a phone

The deployed HTTPS site is an installable Progressive Web App named **BCB Payslips** and uses the official BCB finance emblem. The install option is intentionally shown on the public authentication screens only.

- Android (Chrome/Edge): open the Render HTTPS URL, tap **Install Finance App**, then confirm **Install**. The browser menu's **Install app** or **Add to Home screen** option is also supported.
- iPhone/iPad (Safari): open the Render HTTPS URL, tap **Share**, choose **Add to Home Screen**, then tap **Add**.

The installed application still requires the secured server and an internet connection for confidential work. Its service worker caches only the public application shell and offline message; API responses, staff records, payroll data, payslips, exports, uploads, and profile pictures are never stored for offline use.

## Backups and recovery

Encrypted backups run according to the Portal Control schedule and are written to `BACKUP_DIR`. Retention is controlled by `BACKUP_RETENTION_COUNT`. Interactive export and restore remain disabled by default because backups contain confidential bank records; enable `ALLOW_BOSS_ADMIN_DATABASE_MAINTENANCE=true` only for a separately approved maintenance window. Keep a copy of `BACKUP_ENCRYPTION_KEY` in the bank's approved secrets vault and test restoration in staging every quarter.

Branding, branches, departments, statutory contribution rates, validation thresholds, email/PDF defaults, security policy, and retention schedules are controlled in Portal Control and every change is audited. New payroll batches snapshot the applicable rate profile by effective month, so later changes cannot rewrite old payroll or sent payslips. Those retention fields define policy; immutable payroll and audit history is not silently deleted. Use the bank's approved archive and disposal procedure before removing historical records.

## Operations and monitoring

- Monitor `/api/health` for database, pending-queue, and worker-heartbeat health. A Super Admin can inspect the non-sensitive count snapshot at `/api/metrics`.
- Configure a separate `MONITORING_TOKEN` on the Render web and worker services and matching `PRODUCTION_BASE_URL`/`PRODUCTION_MONITORING_TOKEN` secrets in the GitHub `production` environment. The scheduled **Production Monitoring** workflow checks the protected `/api/monitoring/status` feed every 15 minutes and opens or resolves a restricted repository issue without including payroll or recipient data.
- Alert when the health endpoint fails, pending deliveries grow continuously, or `Failed`/`Bounced` email counts rise.
- Rotate SMTP, webhook, encryption, and backup secrets according to bank policy. Rotation of encryption keys must include a tested data re-encryption or restore plan.
- Test SMTP outage recovery, duplicate-send prevention, provider bounce webhooks, password reset email delivery, and backup restoration in staging before each production release.
- Forward container logs to restricted centralized storage and retain them according to the bank's security policy. Request IDs are returned in `X-Request-ID` and timing is exposed through `Server-Timing` for incident tracing.

## Acceptance, policy and training pack

- [Security review and penetration-test gate](docs/SECURITY_REVIEW_AND_PENTEST.md)
- [Bank user-acceptance testing and sign-off](docs/BANK_UAT_ACCEPTANCE.md)
- [Device, browser, PDF and connectivity acceptance](docs/DEVICE_AND_CONNECTIVITY_ACCEPTANCE.md)
- [Production monitoring and alert-response runbook](docs/PRODUCTION_MONITORING_RUNBOOK.md)
- [Bank security, privacy and operational policies](docs/BANK_SECURITY_AND_DATA_POLICIES.md)
- [Operations, recovery and training manual](docs/OPERATIONS_RECOVERY_AND_TRAINING.md)

## Pilot checklist

- Create separate Finance Officer and Finance Approver accounts and enable MFA.
- Import a small CSV/Excel staff list and correct every preview error.
- Create a test payroll, confirm calculations, submit it, and approve it using a different account.
- Preview individual PDFs and the ZIP; confirm confidentiality and password rules.
- Send a test email, then a small approved batch; confirm no recipient can see another address.
- Force one delivery failure and confirm retry/audit reporting.
- Create, download, and restore an encrypted backup in staging.
- Check the dashboard and critical pages on mobile, tablet, and desktop.
- Review audit logs, HTTPS headers, session timeout, account lockout, and inactive-staff exclusion.
