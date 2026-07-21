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

Run the isolated browser workflow on desktop and mobile with:

```powershell
npm run test:e2e
```

The browser suite creates only temporary synthetic staff, payroll and email records under `.tmp/`. It verifies staff deactivation/reactivation, maker-checker correction and approval, PDF preview, private bulk delivery, delivery status and post-send revisioning. Run `npm run test:services` for the local SMTP integration gate; the CI service job also runs the PostgreSQL gate against an ephemeral database.

## Staging and production

1. Install Docker and Docker Compose on a controlled server.
2. Put the TLS certificate and private key at `deploy/certs/fullchain.pem` and `deploy/certs/privkey.pem`.
3. Configure `.env.production` with PostgreSQL, encryption, SMTP, origin, and webhook secrets.
4. Start with `docker compose up -d --build`.
5. Verify `https://your-host/api/health`, then test with non-production staff and payroll data.
6. Complete the pilot checklist below before importing real payroll data.

The application container runs Waitress, PostgreSQL stores all application documents transactionally, nginx terminates HTTPS, and a dedicated worker resumes unfinished email deliveries after a restart. Production startup refuses SQLite when `REQUIRE_POSTGRESQL=true`. Keep the app and worker services running together.

### Render deployment

The included `render.yaml` creates a Docker web service, a dedicated background email worker, PostgreSQL, a persistent encrypted-backup/upload disk, and HTTPS enforcement. In Render, create a Blueprint from the repository and enter every value marked `sync: false`. The web and worker must receive the same `DATA_ENCRYPTION_KEY` and SMTP credentials. Generate valid independent Fernet keys before the first deployment. Set `ALLOWED_ORIGINS` and `PASSWORD_RESET_BASE_URL` to the final Render HTTPS URL. Do not import real staff or payroll information until the health check passes and SMTP, reset email, upload protection, PDF generation, delivery retry, and backup restore have been tested in staging.

Install and update the malware scanner used by `MALWARE_SCANNER_COMMAND` (the supplied container installs ClamAV). Production uploads fail closed when the configured scanner is unavailable. Schedule signature updates on the host or rebuild the container regularly.

## Backups and recovery

Encrypted backups run according to the Portal Control schedule and are written to `BACKUP_DIR`. Retention is controlled by `BACKUP_RETENTION_COUNT`. Interactive export and restore remain disabled by default because backups contain confidential bank records; enable `ALLOW_BOSS_ADMIN_DATABASE_MAINTENANCE=true` only for a separately approved maintenance window. Keep a copy of `BACKUP_ENCRYPTION_KEY` in the bank's approved secrets vault and test restoration in staging every quarter.

Branding, branches, departments, statutory contribution rates, validation thresholds, email/PDF defaults, security policy, and retention schedules are controlled in Portal Control and every change is audited. New payroll batches snapshot the applicable rate profile by effective month, so later changes cannot rewrite old payroll or sent payslips. Those retention fields define policy; immutable payroll and audit history is not silently deleted. Use the bank's approved archive and disposal procedure before removing historical records.

## Operations and monitoring

- Monitor `/api/health` for database, pending-queue, and worker-heartbeat health. A Super Admin can inspect the non-sensitive count snapshot at `/api/metrics`.
- Alert when the health endpoint fails, pending deliveries grow continuously, or `Failed`/`Bounced` email counts rise.
- Rotate SMTP, webhook, encryption, and backup secrets according to bank policy. Rotation of encryption keys must include a tested data re-encryption or restore plan.
- Test SMTP outage recovery, duplicate-send prevention, provider bounce webhooks, password reset email delivery, and backup restoration in staging before each production release.
- Forward container logs to restricted centralized storage and retain them according to the bank's security policy. Request IDs are returned in `X-Request-ID` and timing is exposed through `Server-Timing` for incident tracing.

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
