# Bank User-Acceptance Testing and Sign-off

Status: **Awaiting execution by bank representatives in staging**.

Use synthetic staff and salary information only. A Finance Officer must not approve their own payroll. Record defects without copying confidential information into public issue trackers.

## Test team

| Role | Named tester | Account confirmed | MFA confirmed |
|---|---|---:|---:|
| Super Admin |  | ☐ | ☐ |
| Admin |  | ☐ | ☐ |
| Finance Officer |  | ☐ | ☐ |
| Finance Approver |  | ☐ | ☐ |
| Auditor |  | ☐ | ☐ |
| Management |  | ☐ | ☐ |
| Boss Admin |  | ☐ | ☐ |

## Acceptance scenarios

| ID | Scenario | Expected result | Pass/Fail | Evidence/defect |
|---|---|---|---|---|
| UAT-01 | Login, lockout, reset, MFA and logout | Secure access and correct recovery |  |  |
| UAT-02 | Add, edit, deactivate and reactivate staff | Inactive staff excluded from new payroll |  |  |
| UAT-03 | Import valid, invalid and duplicate staff records | Errors identified before saving |  |  |
| UAT-04 | Create payroll and enter/copy salary data | Correct cedi formatting and calculations |  |  |
| UAT-05 | Submit, reject, correct and approve payroll | Maker-checker rules and history preserved |  |  |
| UAT-06 | Preview/download one PDF and ZIP | Correct staff data, password and layout |  |  |
| UAT-07 | Send test email and approved synthetic batch | Private attachment to each recipient |  |  |
| UAT-08 | Receive delivery, bounce and failure callbacks | Accurate delivery status and history |  |  |
| UAT-09 | Resend failed only | No duplicate delivery to successful recipients |  |  |
| UAT-10 | Correct an already-sent payslip | New version created; original retained |  |  |
| UAT-11 | Search, filter and export reports | Screen and exports match |  |  |
| UAT-12 | Review audit trail | Actor, action, date/time and changes present |  |  |
| UAT-13 | Verify all role restrictions | Unauthorized pages/actions are blocked |  |  |
| UAT-14 | Complete encrypted backup/restore drill | Restored staging records reconcile |  |  |

## Exit criteria

- All critical scenarios pass.
- No open Critical/High defect; accepted Medium/Low defects have owners and dates.
- Finance totals reconcile independently with the approved test source.
- Security, device compatibility, backup recovery, and email-delivery evidence is attached.
- Training is completed and support/escalation contacts are agreed.

## Sign-off

Finance representative: ____________________ Date: __________ Decision: Accept / Reject

IT/Security representative: _________________ Date: __________ Decision: Accept / Reject

Management sponsor: ________________________ Date: __________ Decision: Accept / Reject

Conditions or exceptions: __________________________________________________
