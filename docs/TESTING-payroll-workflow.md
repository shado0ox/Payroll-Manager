# Manual regression checklist

Run against the isolated test database/container only.

1. Open a payroll run in UNDER_REVIEW and approve it.
2. Refresh immediately and again after several seconds; status must remain APPROVED.
3. Recalculation on APPROVED/POSTED must be blocked. Reopen approval first when allowed.
4. Create a partial payment batch. It must start SCHEDULED and bank export must not mark it paid.
5. Mark the batch PAID explicitly; refresh and verify paid total remains fixed and only unpaid/held employees remain available.
6. Recalculation with SCHEDULED or PAID batch must be blocked.
7. Edit an existing user's permissions without entering a password; original password must continue to work.
8. On login choose Forgot password, submit a registered email, and verify the response is indistinguishable from an unknown email.
9. Open the emailed reset link, set a strong new password, and verify the token cannot be reused.
10. Verify old sessions for that user are invalid after reset and the new password signs in successfully.
