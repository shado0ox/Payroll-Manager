# PR21 validation scenarios

- Add employee: suggested employee number can be overwritten before save; duplicate number is rejected.
- Sidebar: Dashboard → Employees → Payroll → Attendance → Loans/Deductions → Settlements → Company Profile.
- Held employee: after a payroll batch already exists, the held entitlement appears in Settlements and can be paid independently.
- Retroactive employee: employee added after an approved/posted payroll period with salaryStartDate inside/before that period appears as a settlement candidate for each unpaid closed month.
- Previously scheduled/paid payroll employee is excluded from settlement candidates.
- Bank settlement requires Saudi IBAN; cash may be used without IBAN.
- Settlement records entitlement period, payment date, payment method and reference separately.
- Paid settlement dedupe key prevents a second active settlement for the same entitlement.
- Existing held payroll item is marked SETTLED only after settlement confirmation; already paid payroll items are not recalculated.
- Employee statement shows paid settlements separately from the original payroll period.