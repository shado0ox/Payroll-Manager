# Merge gate

This branch must stay out of production until all checks below are complete.

- [ ] Feature transforms run successfully from a clean checkout.
- [ ] Unit/contract tests pass.
- [ ] Lint passes.
- [ ] Production build passes.
- [ ] Test DB: approval survives refresh.
- [ ] Test DB: approved/posted recalculation blocked.
- [ ] Test DB: partial batch starts scheduled; export does not mark paid.
- [ ] Test DB: explicit paid confirmation survives refresh and only outstanding payroll remains.
- [ ] Test DB: editing permissions works with blank password and preserves login password.
- [ ] Test DB: forgot-password email reset works, expires, is one-time, and revokes old sessions.
- [ ] No production deployment until user approval after the above checks.
