# Bank Security, Privacy and Operational Policies

Status: **Draft for legal, compliance, HR, finance, IT and management approval**. Ghanaian legal and regulatory requirements must be confirmed by the bank's qualified advisers.

## Data classification and privacy

Payslips, salaries, deductions, staff identifiers, contact details, PDFs, backups, MFA material and delivery logs are Confidential Bank Information. Access is granted only for an approved work purpose and least-privilege role. Boss Admin may configure the platform but must not access payroll activity or salary content.

Real information must not be used in development, public issue trackers, screenshots, training demonstrations, or penetration testing. Exports and printed payslips must be stored only in bank-approved encrypted locations and securely destroyed when no longer required.

## Retention and disposal

| Record | Proposed minimum | Owner | Disposal control |
|---|---:|---|---|
| Payroll, payslip versions and approval history | 7 years | Finance/Compliance | Approved archive and witnessed secure disposal |
| Audit/security logs | 7 years | IT/Compliance | Tamper-evident archive and approved deletion |
| Email delivery records | 3 years | Finance/IT | Remove recipient metadata after approval |
| Encrypted backups | 12 scheduled copies plus quarterly recovery evidence | IT | Cryptographic erase and media disposal record |
| Import/upload working files | 30 days after reconciliation | Finance | Secure deletion after confirmed import |
| Password reset tokens and sessions | Application expiry | IT | Automatic expiry/revocation |

Portal settings express policy but must not silently delete immutable payroll or audit evidence. Any disposal requires written approval, an audit record, legal-hold checking, and successful verification.

## Access review

- Managers approve access before account creation; shared accounts are prohibited.
- Super Admin reviews active, suspended, disabled, role, last-login, failed-attempt and MFA status monthly.
- Finance Approver access is reviewed before every payroll cycle.
- Privileged access is recertified quarterly; Boss Admin access is independently reviewed.
- Dormant, transferred, or unnecessary accounts are suspended promptly and investigated.

## Staff exit and transfer

HR notifies Admin and IT before the effective exit time. Admin marks the staff directory record inactive so it remains in history but is excluded from new payroll and sending lists. IT disables the user account, revokes sessions, resets MFA, removes groups/API access, retrieves devices, transfers approved records, and records completion. Salary history, old payslips and audit evidence are retained; they are not deleted to hide prior activity.

For transfers, update branch/department and reassess role rather than creating duplicate identities. Emergency termination requires immediate access suspension followed by documented review.

## Incident response

1. **Identify:** record time, reporter, affected service, request IDs and symptoms without copying salary data.
2. **Contain:** suspend affected accounts, revoke sessions, stop the email queue or deployment when necessary, and preserve logs.
3. **Escalate:** notify IT/Security, Finance owner, management, compliance/privacy contact and approved providers according to severity.
4. **Investigate:** preserve evidence, determine scope, validate payroll/PDF recipients, and assess legal notification duties.
5. **Recover:** restore from a verified backup, rotate affected secrets, validate PostgreSQL/worker/email health, and use the correction workflow where required.
6. **Close:** document impact, decisions, notifications, corrective actions and lessons learned; obtain management closure.

Critical events include suspected salary disclosure, unauthorized payroll changes, stolen privileged credentials, failed backup recovery, malware, bulk misdelivery, encryption-key exposure, and prolonged database/worker outage.

## Policy approvals

Finance: ____________________  HR: ____________________  IT/Security: ____________________

Compliance/Privacy: ____________________  Management: ____________________  Effective date: __________
