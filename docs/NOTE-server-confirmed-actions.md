# Server-confirmed payroll actions

The final implementation must not rely on the generic background state autosave for irreversible workflow actions.

Required dedicated server-confirmed actions:

- approve payroll run
- reverse approval
- post payroll run
- create payment batch
- confirm payment batch as paid
- cancel/mark failed scheduled payment batch

The UI should show a pending state while each request is in flight and only update the authoritative workflow status after a successful response. This prevents refreshes or queued state writes from reverting approvals/payments.
