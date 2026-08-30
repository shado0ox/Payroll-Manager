# Authoritative payroll workflow action contract

Planned API endpoints on this branch:

- `POST /api/payroll-runs/:id/approve`
- `POST /api/payroll-runs/:id/reopen`
- `POST /api/payroll-runs/:id/post`
- `POST /api/payroll-runs/:id/payment-batches`
- `POST /api/payroll-runs/:id/payment-batches/:batchId/paid`
- `POST /api/payroll-runs/:id/payment-batches/:batchId/cancel`
- `POST /api/payroll-runs/:id/payment-batches/:batchId/failed`

All endpoints must authenticate, enforce tenant scope and permission, update the database inside a transaction, and return the authoritative updated payroll run. Browser state should be updated from that response rather than optimistically claiming success.
