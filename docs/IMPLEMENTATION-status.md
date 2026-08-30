# Implementation status

- [x] Branch isolated from main.
- [x] Recalculation lock for approved/posted payroll.
- [x] Recalculation lock for scheduled/paid payment batches.
- [x] Existing-user permission edits stop reusing/sending employee password.
- [x] Password reset backend transform: hashed one-time 30-minute token.
- [x] Password reset invalidates old sessions after success.
- [x] Password reset login UI and API helpers.
- [x] Case-insensitive unique non-empty user email index.
- [x] Security/workflow contract tests and CI workflow.
- [ ] CI green on branch.
- [ ] Runtime test against cloned/test PostgreSQL database.
- [ ] Approval persistence made server-confirmed rather than autosave-only.
- [ ] Explicit payment confirmation metadata verified end-to-end.
- [ ] Production deployment (blocked until all tests pass).
