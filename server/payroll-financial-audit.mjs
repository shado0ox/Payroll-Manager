import crypto from 'node:crypto';

const asArray = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '');

async function insertAudit(client, q, { companyId, user, action, entityType, entityId, details, payload }) {
  if (!companyId) return;
  const occurredAt = new Date().toISOString();
  const id = `audit-${crypto.randomUUID()}`;
  const userId = text(user?.id);
  const userName = text(user?.name || user?.username);
  const userRole = text(user?.role || 'OPERATIONS_MANAGER');
  const fullPayload = {
    id,
    companyId,
    userId,
    userName,
    userRole,
    action,
    entityType,
    entityId,
    timestamp: occurredAt,
    details,
    ...payload,
  };

  await client.query(`INSERT INTO ${q('application_audit_logs')} (
    id,company_id,user_id,user_name,user_role,action,entity_type,entity_id,occurred_at,details,payload,sort_order
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,0)`, [
    id, companyId, userId || null, userName, userRole, action, entityType, entityId,
    occurredAt, details || null, JSON.stringify(fullPayload),
  ]);
}

export async function appendPayrollFinancialAudit(client, q, { stored, next, user }) {
  const beforeRuns = new Map(asArray(stored?.payrollRuns).map(run => [run.id, run]));
  const nextRuns = new Map(asArray(next?.payrollRuns).map(run => [run.id, run]));

  for (const [runId, oldRun] of beforeRuns) {
    const newRun = nextRuns.get(runId);
    if (!newRun) continue;
    const oldBatches = new Map(asArray(oldRun.paymentBatches).map(batch => [batch.id, batch]));
    const newBatches = new Map(asArray(newRun.paymentBatches).map(batch => [batch.id, batch]));

    for (const [batchId, oldBatch] of oldBatches) {
      const newBatch = newBatches.get(batchId);
      if (!newBatch || oldBatch.status !== 'PAID' || newBatch.status !== 'SCHEDULED') continue;
      const reason = text(newBatch.paymentReversalReason).trim();
      const amount = Number(newBatch.totalAmount || 0);
      await insertAudit(client, q, {
        companyId: text(newRun.companyId || oldRun.companyId),
        user,
        action: 'PAYROLL_PAYMENT_REVERSED',
        entityType: 'PAYMENT_BATCH',
        entityId: batchId,
        details: `Payment reversal ${newBatch.batchNumber || batchId} | payroll ${newRun.periodMonth || ''} | ${amount.toFixed(2)} SR | ${reason}`,
        payload: {
          payrollRunId: runId,
          periodMonth: newRun.periodMonth,
          batchNumber: newBatch.batchNumber,
          amount,
          reason,
          diff: {
            before: { status: oldBatch.status, paymentDate: oldBatch.paymentDate ?? null },
            after: {
              status: newBatch.status,
              paymentDate: newBatch.paymentDate ?? null,
              reversedPaymentDate: newBatch.reversedPaymentDate ?? null,
              paymentReversedAt: newBatch.paymentReversedAt ?? null,
            },
          },
        },
      });
    }
  }

  const beforeLoans = new Map(asArray(stored?.loans).map(loan => [loan.id, loan]));
  for (const newLoan of asArray(next?.loans)) {
    const oldLoan = beforeLoans.get(newLoan.id);
    if (!oldLoan) continue;
    const oldAdjustments = asArray(oldLoan.adjustments);
    const newAdjustments = asArray(newLoan.adjustments);
    if (newAdjustments.length !== oldAdjustments.length + 1) continue;
    const adjustment = newAdjustments[newAdjustments.length - 1];
    if (!adjustment || !adjustment.id) continue;
    await insertAudit(client, q, {
      companyId: text(newLoan.companyId),
      user,
      action: 'LOAN_ADJUSTMENT_CREATED',
      entityType: 'LOAN',
      entityId: newLoan.id,
      details: `Loan adjustment ${Number(adjustment.amount || 0).toFixed(2)} SR | balance ${Number(oldLoan.remainingAmount || 0).toFixed(2)} -> ${Number(newLoan.remainingAmount || 0).toFixed(2)} SR | ${text(adjustment.reason).trim()}`,
      payload: {
        employeeId: newLoan.employeeId,
        adjustmentId: adjustment.id,
        amount: Number(adjustment.amount || 0),
        reason: text(adjustment.reason).trim(),
        adjustmentDate: adjustment.date,
        diff: {
          before: { remainingAmount: Number(oldLoan.remainingAmount || 0) },
          after: { remainingAmount: Number(newLoan.remainingAmount || 0) },
        },
      },
    });
  }
}
