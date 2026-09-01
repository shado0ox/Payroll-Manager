PR21 implementation branch: feat/payroll-settlements-ledger

Implemented in this branch:
- Editable auto-suggested employee number with duplicate guard.
- Sidebar reorder requested by product owner.
- New Payroll Settlements workspace.
- Held payroll settlement candidates.
- Retroactive employee settlement candidates for closed payroll periods using the payroll calculation engine.
- Exclusion of employees already included in scheduled/paid payment batches.
- Settlement payment date/method/reference tracking.
- Employee statement settlement visibility.
- PostgreSQL app_state persistence wiring and server-side duplicate/paid-lock validation.
- Regression tests and validation scenarios.

Pending before merge:
- GitHub Actions verification.
- Review any CI failures and patch before merge.
- Production deployment only after successful CI and backup/rollback preparation.