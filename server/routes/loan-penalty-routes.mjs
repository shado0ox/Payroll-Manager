import express from 'express';

export function createLoanPenaltyRouter({
  auth,
  writeLimiter,
  pool,
  q,
  can,
  validPeriodMonth,
  validIsoDate,
  readLockedNormalizedState,
  asArray,
  payrollSourceLocked,
  isAppendOnlyLoanAdjustment,
  workflowError,
  bumpStateVersion,
  appendStateAudit,
  broadcastStateUpdate,
}) {
  const router = express.Router();

router.put('/penalties/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_LOANS_PENALTIES')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    if (record.id !== req.params.id || typeof record.companyId !== 'string' || !req.user.company_ids.includes(record.companyId)
      || typeof record.employeeId !== 'string' || !validPeriodMonth(record.periodMonth) || !validIsoDate(record.date)
      || typeof record.reason !== 'string' || !record.reason.trim() || !Number.isFinite(Number(record.amount)) || Number(record.amount) < 0) {
      return res.status(400).json({ error:'INVALID_PENALTY_RECORD' });
    }
    await client.query('BEGIN');
    const stored = await readLockedNormalizedState(client);
    const existingRecord = asArray(stored.penalties).find(item => item.id === record.id);
    if ((existingRecord && payrollSourceLocked(stored,'penalty',existingRecord)) || payrollSourceLocked(stored,'penalty',record)) {
      throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    }
    const employee = await client.query(`SELECT company_id FROM ${q('employees')} WHERE id=$1 AND is_archived=false`, [record.employeeId]);
    if (!employee.rowCount || employee.rows[0].company_id !== record.companyId) throw workflowError(400, 'INVALID_PENALTY_EMPLOYEE');
    const existing = await client.query(`SELECT company_id,sort_order FROM ${q('penalties')} WHERE id=$1 FOR UPDATE`, [record.id]);
    if (existing.rowCount && existing.rows[0].company_id !== record.companyId) throw workflowError(409, 'PENALTY_COMPANY_IMMUTABLE');
    const sortOrder = existing.rowCount ? existing.rows[0].sort_order : Number((await client.query(`SELECT COALESCE(min(sort_order),0)-1 AS sort_order FROM ${q('penalties')} WHERE company_id=$1`, [record.companyId])).rows[0]?.sort_order || 0);
    await client.query(`INSERT INTO ${q('penalties')} (id,company_id,employee_id,period_month,record_date,reason,amount,applied_in_payroll,payload,sort_order,updated_at)
      VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9::jsonb,$10,now())
      ON CONFLICT (id) DO UPDATE SET employee_id=EXCLUDED.employee_id,period_month=EXCLUDED.period_month,record_date=EXCLUDED.record_date,
        reason=EXCLUDED.reason,amount=EXCLUDED.amount,applied_in_payroll=EXCLUDED.applied_in_payroll,payload=EXCLUDED.payload,updated_at=now()`, [
      record.id,record.companyId,record.employeeId,record.periodMonth,record.date,record.reason.trim(),Number(record.amount),Boolean(record.appliedInPayroll),JSON.stringify(record),sortOrder
    ]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:existing.rowCount ? 'UPDATE_PENALTY' : 'CREATE_PENALTY',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[record.companyId],changes:[{ collection:'penalties',operation:'upsert',records:[record] }] });
    res.json({ record,created:!existing.rowCount,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

router.delete('/penalties/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_LOANS_PENALTIES')) return res.status(403).json({ error:'FORBIDDEN' });
    await client.query('BEGIN');
    const row = await client.query(`SELECT company_id,payload FROM ${q('penalties')} WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!row.rowCount) throw workflowError(404, 'PENALTY_NOT_FOUND');
    if (!req.user.company_ids.includes(row.rows[0].company_id)) throw workflowError(403, 'FORBIDDEN');
    const stored = await readLockedNormalizedState(client);
    if (payrollSourceLocked(stored,'penalty',row.rows[0].payload)) throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    await client.query(`DELETE FROM ${q('penalties')} WHERE id=$1`, [req.params.id]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:'DELETE_PENALTY',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[row.rows[0].company_id],changes:[{ collection:'penalties',operation:'delete',ids:[req.params.id] }] });
    res.json({ deleted:true,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

router.put('/loans/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_LOANS_PENALTIES')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    const numericFields = ['totalAmount','monthlyInstallment','totalInstallments','remainingInstallments','remainingAmount'];
    if (record.id !== req.params.id || typeof record.companyId !== 'string' || !req.user.company_ids.includes(record.companyId)
      || typeof record.employeeId !== 'string' || !validPeriodMonth(record.startDate)
      || !['ACTIVE','COMPLETED','PAUSED'].includes(record.status)
      || numericFields.some(key => !Number.isFinite(Number(record[key])) || Number(record[key]) < 0)
      || !Number.isInteger(Number(record.totalInstallments)) || !Number.isInteger(Number(record.remainingInstallments))) {
      return res.status(400).json({ error:'INVALID_LOAN_RECORD' });
    }
    await client.query('BEGIN');
    const stored = await readLockedNormalizedState(client);
    const existingRecord = asArray(stored.loans).find(item => item.id === record.id);
    const appendOnlyAdjustment = existingRecord ? isAppendOnlyLoanAdjustment(existingRecord,record,req.user) : false;
    if (existingRecord && payrollSourceLocked(stored,'loan',existingRecord) && !appendOnlyAdjustment) {
      throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    }
    const employee = await client.query(`SELECT company_id FROM ${q('employees')} WHERE id=$1 AND is_archived=false`, [record.employeeId]);
    if (!employee.rowCount || employee.rows[0].company_id !== record.companyId) throw workflowError(400, 'INVALID_LOAN_EMPLOYEE');
    const existing = await client.query(`SELECT company_id,sort_order FROM ${q('loans')} WHERE id=$1 FOR UPDATE`, [record.id]);
    if (existing.rowCount && existing.rows[0].company_id !== record.companyId) throw workflowError(409, 'LOAN_COMPANY_IMMUTABLE');
    const sortOrder = existing.rowCount ? existing.rows[0].sort_order : Number((await client.query(`SELECT COALESCE(min(sort_order),0)-1 AS sort_order FROM ${q('loans')} WHERE company_id=$1`, [record.companyId])).rows[0]?.sort_order || 0);
    await client.query(`INSERT INTO ${q('loans')} (
      id,company_id,employee_id,total_amount,monthly_installment,total_installments,remaining_installments,remaining_amount,start_month,status,reason,payload,sort_order,updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,now())
    ON CONFLICT (id) DO UPDATE SET employee_id=EXCLUDED.employee_id,total_amount=EXCLUDED.total_amount,
      monthly_installment=EXCLUDED.monthly_installment,total_installments=EXCLUDED.total_installments,
      remaining_installments=EXCLUDED.remaining_installments,remaining_amount=EXCLUDED.remaining_amount,start_month=EXCLUDED.start_month,
      status=EXCLUDED.status,reason=EXCLUDED.reason,payload=EXCLUDED.payload,updated_at=now()`, [
      record.id,record.companyId,record.employeeId,Number(record.totalAmount),Number(record.monthlyInstallment),Number(record.totalInstallments),
      Number(record.remainingInstallments),Number(record.remainingAmount),record.startDate,record.status,String(record.reason || ''),JSON.stringify(record),sortOrder
    ]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:appendOnlyAdjustment ? 'ADJUST_LOAN' : existing.rowCount ? 'UPDATE_LOAN' : 'CREATE_LOAN',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[record.companyId],changes:[{ collection:'loans',operation:'upsert',records:[record] }] });
    res.json({ record,created:!existing.rowCount,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

router.delete('/loans/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_LOANS_PENALTIES')) return res.status(403).json({ error:'FORBIDDEN' });
    await client.query('BEGIN');
    const row = await client.query(`SELECT company_id,payload FROM ${q('loans')} WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!row.rowCount) throw workflowError(404, 'LOAN_NOT_FOUND');
    if (!req.user.company_ids.includes(row.rows[0].company_id)) throw workflowError(403, 'FORBIDDEN');
    const stored = await readLockedNormalizedState(client);
    if (payrollSourceLocked(stored,'loan',row.rows[0].payload)) throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    await client.query(`DELETE FROM ${q('loans')} WHERE id=$1`, [req.params.id]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:'DELETE_LOAN',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[row.rows[0].company_id],changes:[{ collection:'loans',operation:'delete',ids:[req.params.id] }] });
    res.json({ deleted:true,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

router.put('/temporary-earnings/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_LOANS_PENALTIES')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    if (record.id !== req.params.id || typeof record.companyId !== 'string' || !req.user.company_ids.includes(record.companyId)
      || typeof record.employeeId !== 'string' || !validPeriodMonth(record.periodMonth) || !validIsoDate(record.date)
      || !['COMMISSION','BONUS','INCENTIVE','OTHER'].includes(record.type)
      || !Number.isFinite(Number(record.amount)) || Number(record.amount) < 0 || typeof record.reason !== 'string' || !record.reason.trim()) {
      return res.status(400).json({ error:'INVALID_TEMPORARY_EARNING_RECORD' });
    }
    await client.query('BEGIN');
    const stored = await readLockedNormalizedState(client);
    const existingRecord = asArray(stored.temporaryEarnings).find(item => item.id === record.id);
    if ((existingRecord && payrollSourceLocked(stored,'earning',existingRecord)) || payrollSourceLocked(stored,'earning',record)) {
      throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    }
    const employee = await client.query(`SELECT company_id FROM ${q('employees')} WHERE id=$1 AND is_archived=false`, [record.employeeId]);
    if (!employee.rowCount || employee.rows[0].company_id !== record.companyId) throw workflowError(400, 'INVALID_TEMPORARY_EARNING_EMPLOYEE');
    const existing = await client.query(`SELECT company_id,sort_order FROM ${q('temporary_earnings')} WHERE id=$1 FOR UPDATE`, [record.id]);
    if (existing.rowCount && existing.rows[0].company_id !== record.companyId) throw workflowError(409, 'TEMPORARY_EARNING_COMPANY_IMMUTABLE');
    const sortOrder = existing.rowCount ? existing.rows[0].sort_order : Number((await client.query(`SELECT COALESCE(min(sort_order),0)-1 AS sort_order FROM ${q('temporary_earnings')} WHERE company_id=$1`, [record.companyId])).rows[0]?.sort_order || 0);
    await client.query(`INSERT INTO ${q('temporary_earnings')} (
      id,company_id,employee_id,period_month,record_date,earning_type,amount,reason,applied_in_payroll,payload,sort_order,updated_at
    ) VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10::jsonb,$11,now())
    ON CONFLICT (id) DO UPDATE SET employee_id=EXCLUDED.employee_id,period_month=EXCLUDED.period_month,
      record_date=EXCLUDED.record_date,earning_type=EXCLUDED.earning_type,amount=EXCLUDED.amount,reason=EXCLUDED.reason,
      applied_in_payroll=EXCLUDED.applied_in_payroll,payload=EXCLUDED.payload,updated_at=now()`, [
      record.id,record.companyId,record.employeeId,record.periodMonth,record.date,record.type,Number(record.amount),record.reason.trim(),Boolean(record.appliedInPayroll),JSON.stringify(record),sortOrder
    ]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:existing.rowCount ? 'UPDATE_TEMPORARY_EARNING' : 'CREATE_TEMPORARY_EARNING',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[record.companyId],changes:[{ collection:'temporaryEarnings',operation:'upsert',records:[record] }] });
    res.json({ record,created:!existing.rowCount,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

router.delete('/temporary-earnings/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_LOANS_PENALTIES')) return res.status(403).json({ error:'FORBIDDEN' });
    await client.query('BEGIN');
    const row = await client.query(`SELECT company_id,payload FROM ${q('temporary_earnings')} WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!row.rowCount) throw workflowError(404, 'TEMPORARY_EARNING_NOT_FOUND');
    if (!req.user.company_ids.includes(row.rows[0].company_id)) throw workflowError(403, 'FORBIDDEN');
    const stored = await readLockedNormalizedState(client);
    if (payrollSourceLocked(stored,'earning',row.rows[0].payload)) throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    await client.query(`DELETE FROM ${q('temporary_earnings')} WHERE id=$1`, [req.params.id]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:'DELETE_TEMPORARY_EARNING',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[row.rows[0].company_id],changes:[{ collection:'temporaryEarnings',operation:'delete',ids:[req.params.id] }] });
    res.json({ deleted:true,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});


  return router;
}

