# Finance Payslip Platform Testing Checklist

## Authentication

- Register with an official Bawjiase Community Bank email address.
- Verify email, sign in, sign out, and complete the password reset flow.
- Confirm protected payroll pages redirect unauthenticated users to login.

## Responsive navigation

- Check the sidebar on desktop and the bottom navigation on tablet and mobile.
- Open each requested Finance page and confirm the active navigation state.

## Staff and payroll sample interface

- Search the Staff Directory and open Add New Staff.
- Select a CSV or Excel file on Upload Staff Emails and confirm the preview state appears.
- Edit Basic Salary and Allowance values in Payroll Entry and confirm Gross and Net values update.
- Check Payroll Batches, Payslip Preview, Salary History, and Reports at mobile and desktop widths.

## Payslip delivery sample interface

- Select recipients on Send Payslips and confirm the sample delivery feedback appears.
- Review delivered, opened, and failed statuses in Email Delivery Report.
- Confirm no real email is sent in this visual-only phase.

## Administration

- Confirm only authorized administrators can access User Management.
- Toggle light/dark theme and review Settings, Profile, Notifications, and Audit Logs.

## Quality checks

- Run `npm run lint`, `npm run typecheck`, and `npm run build`.
- Confirm there are no references to the retired product or its customer-collection workflow.
