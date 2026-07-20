# Finance Payslip Platform Testing Checklist

## Authentication

- Register with an official Bawjiase Community Bank email address.
- Verify email, sign in, sign out, and complete the password reset flow.
- Confirm protected payroll pages redirect unauthenticated users to login.
- Confirm Boss Admin lands on Portal Control and can access only Portal Control and their own profile.
- Confirm Boss Admin is hidden from bank User Management and receives 403 responses for staff, payroll, reports, notifications, and delivery endpoints.
- Confirm Super Admin and Admin cannot open Portal Control or assign the Boss Admin role.

## Responsive navigation

- Check the sidebar on desktop and the bottom navigation on tablet and mobile.
- Open each requested Finance page and confirm the active navigation state.

## Staff and payroll sample interface

- Search the Staff Directory and open Add New Staff.
- Select a CSV or Excel file on Upload Staff Emails and confirm the preview state appears.
- Edit Basic Salary and Allowance values in Payroll Entry and confirm Gross and Net values update.
- Change SSF, ESP, PF, and employer rates with a future effective month and confirm only applicable new batches use them.
- Confirm each payroll batch displays and retains its locked rate profile and that its PDF labels match the stored rates.
- Check Payroll Batches, Payslip Preview, Salary History, and Reports at mobile and desktop widths.

## Payslip delivery

- Use a staging SMTP account and send a test email before bulk sending.
- Confirm the pre-send checklist blocks missing, invalid, duplicate, and inactive recipients.
- Send an approved dummy batch and watch Pending, Sending, Sent, Failed, Bounced, Retried, and Delivered states.
- Confirm every message contains exactly one recipient and one matching payslip attachment.
- Stop and restart the worker, then confirm pending deliveries resume without duplicate sends.

## Administration

- Confirm only authorized administrators can access User Management.
- Toggle light/dark theme and review Settings, Profile, Notifications, and Audit Logs.

## Quality checks

- Run `npm run lint`, `npm run typecheck`, and `npm run build`.
- Confirm there are no references to the retired product or its customer-collection workflow.
- Validate 100–500 dummy staff records before enabling production payroll data.
- Confirm Management can open only Dashboard, Reports, Profile, and Notifications.
- Confirm the final active Super Admin cannot be disabled.
