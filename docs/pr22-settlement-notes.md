# PR22 settlement safeguards

- Settlement deletion is implemented as a reversible audit-safe status change (`REVERSED`), never a physical record delete.
- A reversal reason of at least 5 characters is required and stored with `reversedAt`.
- Reversing a settlement sourced from a held payroll entitlement re-opens that source as `HELD` so it can be settled again correctly.
- Retroactive settlement discovery scans every fully elapsed calendar month from `salaryStartDate` through the previous month, even when no approved/posted payroll run exists for that month.
- If an employee already has a payroll item for a month, the settlement engine does not create a duplicate retroactive entitlement for that month.
- The first retroactive month is always prorated from the actual salary start date; this does not change the employee's normal future payroll proration preference.
