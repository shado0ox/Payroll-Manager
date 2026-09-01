# PR21 — Payroll settlements, editable employee numbers, and sidebar order

## Goals

1. Employee number is suggested automatically but remains editable before save. The server remains the authority for uniqueness.
2. Paid payroll is immutable. A successful/scheduled payment batch locks only the entitlement that was included in that batch.
3. Held salary and retroactive salary for employees added after a payroll month closes are paid through a separate Settlements workflow instead of reopening paid payroll.
4. Settlement records carry employee, source period/date range, gross/net amount, reason, status, payment method, payment date, payment reference, and audit metadata.
5. Employee statement distinguishes entitlement period from actual payment date.
6. Sidebar order: Dashboard, Employees, Payroll, Attendance, Loans/Deductions, Settlements, Company Profile, then journals/reports/admin items.

## Settlement rules

- Existing PAID/SCHEDULED payroll payment items are never recalculated by settlement generation.
- HELD payroll items remain tied to their original payroll period.
- A retroactive employee may have one settlement line per unpaid payroll month starting from salaryStartDate.
- Duplicate settlement for the same employee/source-period/source entitlement is rejected server-side.
- Settlement payment is an explicit server-confirmed action; payment date and method are stored separately from entitlement period.
- A paid settlement is immutable except through an explicit reversal action with audit trail.
- Company scope and payroll permissions are enforced server-side.

## Delivery

Implementation is applied as the last feature-hardening transform so future build transforms cannot silently restore the previous workflow. Regression tests cover sidebar order, editable employee numbers, payment locking, duplicate prevention, and settlement persistence.