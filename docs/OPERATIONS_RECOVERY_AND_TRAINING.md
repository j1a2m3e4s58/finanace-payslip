# Operations, Recovery and Training Manual

## Role responsibilities

- **Admin:** creates users, manages staff records and processes joiners/leavers. Does not prepare or approve payroll unless separately authorized.
- **Finance Officer:** creates draft payroll, enters/copies figures, resolves validation, records change reasons and submits.
- **Finance Approver:** independently reviews warnings, changes and totals; approves, rejects or requests correction; performs controlled sending.
- **Auditor:** reads salary history, reports and audit evidence without editing.
- **Management:** reads dashboards and summary reports only.
- **Super Admin:** controls bank users and bank-side security; monitors operations and MFA. Cannot use the isolated Boss Admin control plane.
- **Boss Admin:** maintains platform-wide configuration and deployment controls without payroll, payslip, salary-history or bank audit access.

## Monthly payroll runbook

1. Admin reconciles active/inactive staff and official email warnings.
2. Finance Officer creates the month, optionally copies the prior month, enters changes with reasons, saves, validates and reconciles totals.
3. Finance Officer submits; a different Finance Approver reviews staff count, changes, warnings, income, deductions and net total.
4. Approver rejects with a reason or approves. Only approved payroll proceeds.
5. Preview individual PDFs, validate version/password/configuration and generate the batch.
6. Send a test email, complete the pre-send checklist and confirm the approved recipient count.
7. Send all once. Monitor queue, provider delivery/bounce callbacks and failed-only retry.
8. Reconcile delivery totals, preserve evidence and use a revised version for any post-send correction.

## Administration runbook

- Add users only inside **Users & Access**, preview permissions, require a temporary strong password and enrol MFA.
- Never disable the final Super Admin. Suspend uncertain access first; investigate before deletion.
- Review account status, last login, failed attempts, MFA and roles monthly.
- Change statutory rates, labels, branding, email/PDF settings and retention only through Portal Control with approval and effective dates.
- Never store secrets in source control. Rotate SMTP, monitoring, webhook and encryption material using an approved maintenance plan.

## Deployment runbook

1. Merge only after CI, CodeQL and review pass.
2. Deploy to staging, run acceptance, security scan, synthetic email tests and recovery drill.
3. Record release version, database migration result and rollback point.
4. Obtain Finance, IT/Security and management release approval.
5. Deploy through Render; verify HTTPS `/api/readiness` and protected monitoring before enabling users.
6. Observe logs, queue and delivery status closely during the agreed validation window.

## Disaster recovery

- Incident lead declares recovery and records the reason/time.
- Stop writes or email sending when integrity is uncertain.
- Select the newest verified encrypted backup and a clean PostgreSQL target.
- Restore in an isolated environment first; reconcile staff, payroll, audit and delivery counts/hashes.
- Rotate compromised credentials/keys, revoke sessions and validate malware protection.
- Restore service only after Finance and IT approval; verify readiness, monitoring, login/MFA, a synthetic PDF and a test email.
- Document recovery-point and recovery-time results. Run the staging drill quarterly.

Never test restoration over the only production database. Keep the backup encryption key in the approved secrets vault separately from backup files.

## Training exercises

| Audience | Exercise | Evidence | Frequency |
|---|---|---|---|
| Admin | Joiner, transfer, leaver and role review | Completed checklist | On appointment + annual |
| Finance Officer | Draft, validation, salary change and correction | Synthetic batch | On appointment + annual |
| Finance Approver | Independent review, rejection, approval and send | Synthetic delivery report | On appointment + annual |
| Auditor/Management | Reports, history and read-only boundaries | Access test | Annual |
| Super Admin | User security, MFA reset and monitoring response | Security checklist | Six-monthly |
| Boss Admin/IT | Deployment, configuration, backup and recovery | Staging drill record | Quarterly |
| All users | Privacy, phishing, secure printing and incident reporting | Attendance/quiz | Annual |

Trainer: ____________________  Date: __________  Environment/version: ____________________

Attendees and results: ______________________________________________________
