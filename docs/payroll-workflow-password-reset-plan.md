# Payroll workflow and password reset hardening

This branch implements the approved fixes before any production deployment.

## Payroll workflow
- Approval must be persisted and server-confirmed before the UI reports success.
- Recalculation is blocked for APPROVED/POSTED payroll runs. Reopen/reverse approval first.
- Recalculation is blocked while any SCHEDULED or PAID payment batch exists.
- Downloading a bank file does not mean money was transferred.
- Payment batches start as SCHEDULED and require an explicit confirmation to become PAID.
- PAID batches remain fixed and are excluded from remaining-to-pay calculations.
- Employees in PAID/SCHEDULED batches cannot be accidentally included in another active batch.

## User permissions and passwords
- Editing a user's name, role, companies, status, or permissions must never require or send that user's current password.
- Password reset is removed from user administration.
- Password reset starts only from the login page using the account email address.
- Reset responses must not disclose whether an email address exists.
- Reset tokens must be random, stored only as hashes, single-use, and expire after 30 minutes.
- A successful reset invalidates all existing sessions for that user.
- User emails are unique case-insensitively for non-empty addresses.

## Test gate
No merge to main or production deployment until workflow, refresh persistence, partial payment, and password-reset tests pass.
