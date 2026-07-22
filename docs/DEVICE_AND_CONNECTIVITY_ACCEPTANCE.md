# Device, Browser, PDF and Connectivity Acceptance

Status: **Automated responsive tests exist; physical-device execution remains pending**.

## Required matrix

| Platform | Minimum coverage | Portrait | Landscape | Tester/date | Result |
|---|---|---:|---:|---|---|
| Android phone | Chrome, 320/360/390/430px classes | ☐ | ☐ |  |  |
| iPhone | Safari, small and current-size device | ☐ | ☐ |  |  |
| Android tablet | Chrome | ☐ | ☐ |  |  |
| iPad | Safari | ☐ | ☐ |  |  |
| Windows desktop | Chrome and Edge | N/A | ☐ |  |  |
| macOS desktop | Safari and Chrome | N/A | ☐ |  |  |

## Checks on every device

- Navigation, collapsed sidebar/mobile navigation, search overlays, drawers, dialogs, toasts, forms, keyboard focus, and 44×44 touch targets.
- No horizontal page scrolling; payroll cards, tables, previews and action bars remain usable.
- Light/dark modes, 200% text zoom, reduced motion, screen-reader labels, and visible focus.
- Session timeout, offline/retry messages, interrupted saves, reconnection, and duplicate-submit protection.
- Payslip preview page-fit/zoom, individual download, ZIP download, password opening, and correct version/confidentiality label.

## Printer and PDF checks

Test A4 printing on one office laser printer and one PDF printer. Confirm margins, logo, Ghana cedi amounts, totals, signature area, page count, password protection, selectable/readable text, and no clipped content. Never leave a confidential test print unattended; shred it after acceptance.

## Connectivity profiles

| Profile | Exercise | Expected result | Result/evidence |
|---|---|---|---|
| Offline before request | Open a protected action | Clear offline state; no blank page |  |
| Slow 3G/high latency | Load dashboard and staff list | Branded loading state; usable navigation |  |
| Disconnect during draft save | Restore connection and retry | No silent loss or duplicate payroll |  |
| Disconnect during bulk queue request | Refresh delivery report | Idempotent records; no duplicate sends |  |
| SMTP/provider unavailable | Queue synthetic batch | Failed/retry state and alert recorded |  |

Release owner: ____________________  Completion date: ____________________
