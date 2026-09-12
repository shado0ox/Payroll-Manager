import express from 'express';

export function createPayrollRouter({
  auth,
  writeLimiter,
  pool,
  q,
  can,
  asArray,
  clone,
  sameJson,
  validPeriodMonth,
  validIsoDate,
  workflowError,
  readLockedNormalizedState,
  readNormalizedApplicationState,
  validatePayrollWorkflowChanges,
  validatePayrollCarryForwardState,
  appendPayrollFinancialAudit,
  reconcilePaidPayrollCarryForward,
  reconcileReleasedPayrollCarryForward,
  bumpStateVersion,
  appendStateAudit,
  broadcastStateUpdate,
  persistReconciledPayrollRun,
}) {
  const router = express.Router();

async function commitPayrollCommandState(client, stored, record, user, action, affectedRecords = []) {
  const recordsById = new Map([record,...affectedRecords].map(item => [item.id,item]));
  const nextRuns = asArray(stored.payrollRuns).map(item => recordsById.get(item.id) || item);
  const nextState = { ...stored,payrollRuns:nextRuns };
  await appendPayrollFinancialAudit(client,q,{ stored,next:nextState,user });
  const updated = await bumpStateVersion(client,user.id);
  await appendStateAudit(client,q,{ companyIds:user.company_ids,user,action,version:updated.rows[0].version });
  return updated;
}

router.post('/payroll-runs/:id/status', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stored = await readLockedNormalizedState(client);
    const previous = asArray(stored.payrollRuns).find(item => item.id === req.params.id);
    if (!previous) throw workflowError(404,'PAYROLL_RUN_NOT_FOUND');
    if (!req.user.company_ids.includes(previous.companyId)) throw workflowError(403,'FORBIDDEN');
    const status = String(req.body?.status || '');
    if (status === previous.status) throw workflowError(409,'PAYROLL_STATUS_UNCHANGED');
    const record = { ...previous,status };
    if (status === 'APPROVED' && previous.status === 'UNDER_REVIEW') {
      record.approvedAt = new Date().toISOString();
      record.approvedBy = req.user.name || req.user.username || req.user.id;
    } else if (status === 'UNDER_REVIEW' && previous.status === 'APPROVED') {
      delete record.approvedAt; delete record.approvedBy;
    } else if (status === 'POSTED' && previous.status === 'APPROVED') {
      record.postedAt = new Date().toISOString();
      record.postedBy = req.user.name || req.user.username || req.user.id;
    } else if (status === 'APPROVED' && previous.status === 'POSTED') {
      delete record.postedAt; delete record.postedBy;
    }
    const nextRuns = asArray(stored.payrollRuns).map(item => item.id === record.id ? record : item);
    validatePayrollWorkflowChanges(stored.payrollRuns,nextRuns,req.user);
    validatePayrollCarryForwardState(stored.payrollRuns,nextRuns);
    const payload = clone(record); delete payload.items; delete payload.paymentBatches;
    await client.query(`UPDATE ${q('payroll_runs')} SET status=$2,approved_at=NULLIF($3,'')::timestamptz,posted_at=NULLIF($4,'')::timestamptz,payload=$5::jsonb,updated_at=now() WHERE id=$1`, [record.id,record.status,record.approvedAt || '',record.postedAt || '',JSON.stringify(payload)]);
    const updated = await commitPayrollCommandState(client,stored,record,req.user,'PAYROLL_STATUS_TRANSITION');
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[record.companyId],changes:[{ collection:'payrollRuns',operation:'upsert',records:[record] }] });
    res.json({ record,created:false,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

router.post('/payroll-runs/:id/payment-batches', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stored = await readLockedNormalizedState(client);
    const previous = asArray(stored.payrollRuns).find(item => item.id === req.params.id);
    if (!previous) throw workflowError(404,'PAYROLL_RUN_NOT_FOUND');
    if (!req.user.company_ids.includes(previous.companyId)) throw workflowError(403,'FORBIDDEN');
    const batch = req.body || {};
    if (typeof batch.id !== 'string' || !batch.id || batch.payrollRunId !== previous.id || batch.companyId !== previous.companyId
      || batch.status !== 'SCHEDULED' || !['WPS','BANK_TRANSFER','CASH'].includes(batch.method)
      || !Array.isArray(batch.employeeIds) || !batch.employeeIds.length || !(Number(batch.totalAmount) > 0)
      || !validIsoDate(batch.scheduledDate)) throw workflowError(400,'INVALID_PAYMENT_BATCH');
    const record = { ...previous,paymentBatches:[...asArray(previous.paymentBatches),batch] };
    const nextRuns = asArray(stored.payrollRuns).map(item => item.id === record.id ? record : item);
    validatePayrollWorkflowChanges(stored.payrollRuns,nextRuns,req.user);
    validatePayrollCarryForwardState(stored.payrollRuns,nextRuns);
    const payload = clone(batch); delete payload.employeeIds;
    const sortOrder = Number((await client.query(`SELECT COALESCE(max(sort_order),-1)+1 AS sort_order FROM ${q('payroll_payment_batches')} WHERE payroll_run_id=$1`, [previous.id])).rows[0]?.sort_order || 0);
    await client.query(`INSERT INTO ${q('payroll_payment_batches')} (id,payroll_run_id,company_id,batch_number,status,method,total_amount,scheduled_date,payment_date,payload,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,NULLIF($9,'')::date,$10::jsonb,$11)`, [batch.id,previous.id,batch.companyId,batch.batchNumber || '',batch.status,batch.method,Number(batch.totalAmount),batch.scheduledDate,batch.paymentDate || '',JSON.stringify(payload),sortOrder]);
    await client.query(`INSERT INTO ${q('payroll_payment_batch_items')} (payment_batch_id,employee_id,sort_order)
      SELECT $1,employee_id,(ordinality-1)::integer FROM jsonb_array_elements_text($2::jsonb) WITH ORDINALITY AS ids(employee_id,ordinality)`, [batch.id,JSON.stringify(batch.employeeIds)]);
    const updated = await commitPayrollCommandState(client,stored,record,req.user,'CREATE_PAYMENT_BATCH');
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[record.companyId],changes:[{ collection:'payrollRuns',operation:'upsert',records:[record] }] });
    res.json({ record,created:false,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    if (e?.code === '23505') return res.status(409).json({ error:'PAYMENT_BATCH_DUPLICATE',detail:e.constraint });
    next(e);
  } finally { client.release(); }
});

router.patch('/payroll-runs/:id/payment-batches/:batchId/status', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stored = await readLockedNormalizedState(client);
    const previous = asArray(stored.payrollRuns).find(item => item.id === req.params.id);
    if (!previous) throw workflowError(404,'PAYROLL_RUN_NOT_FOUND');
    if (!req.user.company_ids.includes(previous.companyId)) throw workflowError(403,'FORBIDDEN');
    const oldBatch = asArray(previous.paymentBatches).find(item => item.id === req.params.batchId);
    if (!oldBatch) throw workflowError(404,'PAYMENT_BATCH_NOT_FOUND');
    const status = String(req.body?.status || '');
    let nextBatch = { ...oldBatch,status };
    if (oldBatch.status === 'SCHEDULED' && status === 'PAID') {
      nextBatch.paymentDate = validIsoDate(req.body?.paymentDate) ? req.body.paymentDate : new Date().toISOString().slice(0,10);
    } else if (oldBatch.status === 'PAID' && status === 'SCHEDULED') {
      nextBatch = { ...nextBatch,reversedPaymentDate:oldBatch.paymentDate,paymentDate:undefined,paymentReversalReason:String(req.body?.paymentReversalReason || '').trim() };
    }
    const record = { ...previous,paymentBatches:asArray(previous.paymentBatches).map(item => item.id === nextBatch.id ? nextBatch : item) };
    const affectedPayrollRuns = oldBatch.status === 'SCHEDULED' && status === 'PAID'
      ? reconcilePaidPayrollCarryForward({ runs:stored.payrollRuns,employees:stored.employees,sourceRun:record,paidBatch:nextBatch })
      : oldBatch.status === 'SCHEDULED' && ['CANCELLED','FAILED'].includes(status)
        ? reconcileReleasedPayrollCarryForward({ runs:stored.payrollRuns,sourceRun:record,releasedBatch:nextBatch })
        : [];
    const affectedById = new Map(affectedPayrollRuns.map(item => [item.id,item]));
    const nextRuns = asArray(stored.payrollRuns).map(item => item.id === record.id ? record : (affectedById.get(item.id) || item));
    validatePayrollWorkflowChanges(stored.payrollRuns,nextRuns,req.user);
    validatePayrollCarryForwardState(stored.payrollRuns,nextRuns);
    nextBatch = record.paymentBatches.find(item => item.id === nextBatch.id);
    const payload = clone(nextBatch); delete payload.employeeIds;
    await client.query(`UPDATE ${q('payroll_payment_batches')} SET status=$3,payment_date=NULLIF($4,'')::date,payload=$5::jsonb,updated_at=now() WHERE id=$1 AND payroll_run_id=$2`, [nextBatch.id,previous.id,nextBatch.status,nextBatch.paymentDate || '',JSON.stringify(payload)]);
    for (const affectedRun of affectedPayrollRuns) await persistReconciledPayrollRun(client,affectedRun);
    const updated = await commitPayrollCommandState(client,stored,record,req.user,'PAYMENT_BATCH_STATUS_TRANSITION',affectedPayrollRuns);
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[record.companyId],changes:[{ collection:'payrollRuns',operation:'upsert',records:[record,...affectedPayrollRuns] }] });
    res.json({ record,affectedPayrollRuns,created:false,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

router.put('/payroll-runs/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_PAYROLL')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    if (record.id !== req.params.id || typeof record.companyId !== 'string' || !req.user.company_ids.includes(record.companyId)
      || !validPeriodMonth(record.periodMonth) || !['DRAFT','UNDER_REVIEW','APPROVED','POSTED'].includes(record.status)
      || !Array.isArray(record.items) || !Array.isArray(record.paymentBatches || [])) {
      return res.status(400).json({ error:'INVALID_PAYROLL_RUN' });
    }
    await client.query('BEGIN');
    const stored = await readLockedNormalizedState(client);
    const existingRecord = asArray(stored.payrollRuns).find(item => item.id === record.id);
    if (existingRecord && existingRecord.companyId !== record.companyId) throw workflowError(409, 'PAYROLL_COMPANY_IMMUTABLE');
    if (existingRecord && (existingRecord.status !== record.status || !sameJson(existingRecord.paymentBatches,record.paymentBatches))) {
      throw workflowError(409,'PAYROLL_COMMAND_ENDPOINT_REQUIRED');
    }
    const nextRuns = existingRecord
      ? asArray(stored.payrollRuns).map(item => item.id === record.id ? record : item)
      : [record,...asArray(stored.payrollRuns)];
    validatePayrollWorkflowChanges(stored.payrollRuns,nextRuns,req.user);
    validatePayrollCarryForwardState(stored.payrollRuns,nextRuns);
    const nextState = { ...stored,payrollRuns:nextRuns };
    await appendPayrollFinancialAudit(client,q,{ stored,next:nextState,user:req.user });

    const existing = await client.query(`SELECT company_id,sort_order FROM ${q('payroll_runs')} WHERE id=$1 FOR UPDATE`, [record.id]);
    const sortOrder = existing.rowCount ? existing.rows[0].sort_order : Number((await client.query(`SELECT COALESCE(min(sort_order),0)-1 AS sort_order FROM ${q('payroll_runs')} WHERE company_id=$1`, [record.companyId])).rows[0]?.sort_order || 0);
    const runPayload = clone(record);
    delete runPayload.items;
    delete runPayload.paymentBatches;
    await client.query(`INSERT INTO ${q('payroll_runs')} (
      id,company_id,period_month,status,employees_count,total_gross_salaries,total_deductions,total_net_salaries,total_company_cost,
      created_at,calculated_at,approved_at,posted_at,payload,sort_order,updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,'')::timestamptz,NULLIF($11,'')::timestamptz,NULLIF($12,'')::timestamptz,NULLIF($13,'')::timestamptz,$14::jsonb,$15,now())
    ON CONFLICT (id) DO UPDATE SET period_month=EXCLUDED.period_month,status=EXCLUDED.status,employees_count=EXCLUDED.employees_count,
      total_gross_salaries=EXCLUDED.total_gross_salaries,total_deductions=EXCLUDED.total_deductions,total_net_salaries=EXCLUDED.total_net_salaries,
      total_company_cost=EXCLUDED.total_company_cost,calculated_at=EXCLUDED.calculated_at,approved_at=EXCLUDED.approved_at,
      posted_at=EXCLUDED.posted_at,payload=EXCLUDED.payload,updated_at=now()`, [
      record.id,record.companyId,record.periodMonth,record.status,Number(record.employeesCount || record.items.length),
      Number(record.totalGrossSalaries || 0),Number(record.totalDeductions || 0),Number(record.totalNetSalaries || 0),Number(record.totalCompanyCost || 0),
      record.createdAt || '',record.calculatedAt || '',record.approvedAt || '',record.postedAt || '',JSON.stringify(runPayload),sortOrder
    ]);

    await client.query(`DELETE FROM ${q('payroll_payment_batch_items')} WHERE payment_batch_id IN (SELECT id FROM ${q('payroll_payment_batches')} WHERE payroll_run_id=$1)`, [record.id]);
    await client.query(`DELETE FROM ${q('payroll_payment_batches')} WHERE payroll_run_id=$1`, [record.id]);
    await client.query(`DELETE FROM ${q('payroll_run_items')} WHERE payroll_run_id=$1`, [record.id]);
    await client.query(`INSERT INTO ${q('payroll_run_items')} (
      payroll_run_id,id,employee_id,employee_no,employee_name,entitlement_status,entitlement_reason,base_salary,total_gross_salary,total_deductions,net_salary,payload,sort_order
    ) SELECT $1,item->>'id',item->>'employeeId',COALESCE(item->>'employeeNo',''),COALESCE(item->>'employeeName',''),
      COALESCE(item->>'entitlementStatus','PAYABLE'),NULLIF(item->>'entitlementReason',''),COALESCE(NULLIF(item->>'baseSalary','')::numeric,0),
      COALESCE(NULLIF(item->>'totalGrossSalary','')::numeric,0),COALESCE(NULLIF(item->>'totalDeductions','')::numeric,0),
      COALESCE(NULLIF(item->>'netSalary','')::numeric,0),item,(ordinality-1)::integer
      FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS source(item,ordinality)`, [record.id,JSON.stringify(record.items)]);
    await client.query(`INSERT INTO ${q('payroll_payment_batches')} (
      id,payroll_run_id,company_id,batch_number,status,method,total_amount,scheduled_date,payment_date,payload,sort_order
    ) SELECT batch->>'id',$1,batch->>'companyId',COALESCE(batch->>'batchNumber',''),COALESCE(batch->>'status','SCHEDULED'),
      COALESCE(batch->>'method','BANK_TRANSFER'),COALESCE(NULLIF(batch->>'totalAmount','')::numeric,0),NULLIF(batch->>'scheduledDate','')::date,
      NULLIF(batch->>'paymentDate','')::date,batch-'employeeIds',(ordinality-1)::integer
      FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS source(batch,ordinality)`, [record.id,JSON.stringify(record.paymentBatches || [])]);
    await client.query(`INSERT INTO ${q('payroll_payment_batch_items')} (payment_batch_id,employee_id,sort_order)
      SELECT batch->>'id',employee_id,(employee_ordinality-1)::integer
      FROM jsonb_array_elements($1::jsonb) AS source(batch)
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(batch->'employeeIds','[]'::jsonb)) WITH ORDINALITY AS employee_ids(employee_id,employee_ordinality)`, [JSON.stringify(record.paymentBatches || [])]);

    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:existing.rowCount ? 'UPDATE_PAYROLL_RUN' : 'CREATE_PAYROLL_RUN',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[record.companyId],changes:[{ collection:'payrollRuns',operation:'upsert',records:[record] }] });
    res.json({ record,created:!existing.rowCount,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    if (e?.code === '23505') return res.status(409).json({ error:'PAYROLL_RUN_DUPLICATE',detail:e.constraint });
    next(e);
  } finally { client.release(); }
});

function validateSettlementRecord(record, user) {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id
    || typeof record.companyId !== 'string' || !user.company_ids.includes(record.companyId)
    || typeof record.employeeId !== 'string' || !record.employeeId
    || typeof record.employeeNo !== 'string' || typeof record.employeeName !== 'string'
    || !validPeriodMonth(record.periodMonth) || !validIsoDate(record.periodStart) || !validIsoDate(record.periodEnd)
    || record.periodEnd < record.periodStart || !(Number(record.amount) > 0)
    || !['HELD_PAYROLL','RETROACTIVE_EMPLOYEE','PAYROLL_DIFFERENCE'].includes(record.reason)
    || typeof record.dedupeKey !== 'string' || !record.dedupeKey
    || record.status !== 'PAID' || !['WPS','BANK_TRANSFER','CASH'].includes(record.paymentMethod)
    || !validIsoDate(record.paymentDate) || Number.isNaN(Date.parse(record.createdAt)) || Number.isNaN(Date.parse(record.paidAt))) {
    throw workflowError(400,'INVALID_PAYROLL_SETTLEMENT');
  }
  const sourceRunId = String(record.sourcePayrollRunId || '');
  const sourceItemId = String(record.sourcePayrollItemId || '');
  if (sourceItemId && !sourceRunId) throw workflowError(400,'INVALID_SETTLEMENT_SOURCE');
}

function settlementSourceRun(stored, record, entitlementStatus, entitlementReason) {
  if (!record.sourcePayrollRunId || !record.sourcePayrollItemId) return null;
  const run = asArray(stored.payrollRuns).find(item => item.id === record.sourcePayrollRunId);
  const item = asArray(run?.items).find(candidate => candidate.id === record.sourcePayrollItemId);
  if (!run || run.companyId !== record.companyId || !item || item.employeeId !== record.employeeId) {
    throw workflowError(400,'INVALID_SETTLEMENT_SOURCE');
  }
  if (entitlementStatus === 'SETTLED') {
    const releasedAfterClosedBatch = item.entitlementStatus === 'PAYABLE' && asArray(run.paymentBatches).some(batch =>
      ['SCHEDULED','PAID'].includes(batch.status) && !asArray(batch.employeeIds).includes(item.employeeId)
    );
    if (!['HELD','UNDER_SETTLEMENT'].includes(item.entitlementStatus) && !releasedAfterClosedBatch) {
      throw workflowError(409,'SETTLEMENT_SOURCE_NOT_HELD');
    }
  }
  if (entitlementStatus === 'HELD' && item.entitlementStatus !== 'SETTLED') {
    throw workflowError(409,'SETTLEMENT_SOURCE_NOT_SETTLED');
  }
  return {
    ...run,
    items:run.items.map(candidate => candidate.id === item.id ? {
      ...candidate,entitlementStatus,
      entitlementReason:entitlementStatus === 'SETTLED' ? (candidate.entitlementReason || entitlementReason) : entitlementReason,
      entitlementUpdatedAt:new Date().toISOString(),
    } : candidate),
  };
}

router.post('/payroll-settlements', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_PAYROLL')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    validateSettlementRecord(record,req.user);
    await client.query('BEGIN');
    await lockStateVersion(client);
    const stored = await readNormalizedApplicationState(client);
    const employee = await client.query(`SELECT company_id,payload FROM ${q('employees')} WHERE id=$1 AND is_archived=false`, [record.employeeId]);
    if (!employee.rowCount || employee.rows[0].company_id !== record.companyId) throw workflowError(400,'INVALID_SETTLEMENT_EMPLOYEE');
    if (record.paymentMethod !== 'CASH' && !String(employee.rows[0].payload?.bankIban || '').startsWith('SA')) {
      throw workflowError(400,'SETTLEMENT_BANK_IBAN_REQUIRED');
    }
    const payrollRun = settlementSourceRun(stored,record,'SETTLED','SETTLED_VIA_PAYROLL_SETTLEMENT');
    const sortOrder = Number((await client.query(`SELECT COALESCE(min(sort_order),0)-1 AS sort_order FROM ${q('payroll_settlements')} WHERE company_id=$1`, [record.companyId])).rows[0]?.sort_order || 0);
    await client.query(`INSERT INTO ${q('payroll_settlements')} (
        id,company_id,employee_id,period_month,period_start,period_end,amount,reason,source_payroll_run_id,
        source_payroll_item_id,dedupe_key,status,payment_method,payment_date,payment_reference,created_at,paid_at,payload,sort_order
      ) VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,NULLIF($9,''),NULLIF($10,''),$11,'PAID',$12,$13::date,NULLIF($14,''),$15::timestamptz,$16::timestamptz,$17::jsonb,$18)`, [
      record.id,record.companyId,record.employeeId,record.periodMonth,record.periodStart,record.periodEnd,Number(record.amount),record.reason,
      record.sourcePayrollRunId || '',record.sourcePayrollItemId || '',record.dedupeKey,record.paymentMethod,record.paymentDate,
      record.paymentReference || '',record.createdAt,record.paidAt,JSON.stringify(record),sortOrder
    ]);
    if (payrollRun) {
      const item = payrollRun.items.find(candidate => candidate.id === record.sourcePayrollItemId);
      await client.query(`UPDATE ${q('payroll_run_items')} SET entitlement_status=$3,entitlement_reason=$4,payload=$5::jsonb,updated_at=now()
        WHERE payroll_run_id=$1 AND id=$2`, [payrollRun.id,item.id,item.entitlementStatus,item.entitlementReason,JSON.stringify(item)]);
    }
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:'CREATE_PAYROLL_SETTLEMENT',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[record.companyId],changes:[
        { collection:'payrollSettlements',operation:'upsert',records:[record] },
        ...(payrollRun ? [{ collection:'payrollRuns',operation:'upsert',records:[payrollRun] }] : []),
      ] });
    res.status(201).json({ record,payrollRun,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    if (e?.code === '23505') return res.status(409).json({ error:'DUPLICATE_PAYROLL_SETTLEMENT' });
    next(e);
  } finally { client.release(); }
});

router.post('/payroll-settlements/:id/reverse', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_PAYROLL')) return res.status(403).json({ error:'FORBIDDEN' });
    const reversalReason = String(req.body?.reversalReason || '').trim();
    if (reversalReason.length < 5) return res.status(400).json({ error:'SETTLEMENT_REVERSAL_REASON_REQUIRED' });
    await client.query('BEGIN');
    await lockStateVersion(client);
    const existing = await client.query(`SELECT company_id,status,payload FROM ${q('payroll_settlements')} WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!existing.rowCount) throw workflowError(404,'PAYROLL_SETTLEMENT_NOT_FOUND');
    if (!req.user.company_ids.includes(existing.rows[0].company_id)) throw workflowError(403,'FORBIDDEN');
    if (existing.rows[0].status === 'REVERSED') throw workflowError(409,'REVERSED_SETTLEMENT_LOCKED');
    if (existing.rows[0].status !== 'PAID') throw workflowError(409,'SETTLEMENT_NOT_PAID');
    const record = { ...existing.rows[0].payload,status:'REVERSED',reversedAt:new Date().toISOString(),reversalReason };
    const stored = await readNormalizedApplicationState(client);
    const payrollRun = settlementSourceRun(stored,record,'HELD','SETTLEMENT_REVERSED');
    await client.query(`UPDATE ${q('payroll_settlements')} SET status='REVERSED',reversed_at=$2::timestamptz,
      reversal_reason=$3,payload=$4::jsonb,updated_at=now() WHERE id=$1`, [record.id,record.reversedAt,reversalReason,JSON.stringify(record)]);
    if (payrollRun) {
      const item = payrollRun.items.find(candidate => candidate.id === record.sourcePayrollItemId);
      await client.query(`UPDATE ${q('payroll_run_items')} SET entitlement_status=$3,entitlement_reason=$4,payload=$5::jsonb,updated_at=now()
        WHERE payroll_run_id=$1 AND id=$2`, [payrollRun.id,item.id,item.entitlementStatus,item.entitlementReason,JSON.stringify(item)]);
    }
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:'REVERSE_PAYROLL_SETTLEMENT',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[record.companyId],changes:[
        { collection:'payrollSettlements',operation:'upsert',records:[record] },
        ...(payrollRun ? [{ collection:'payrollRuns',operation:'upsert',records:[payrollRun] }] : []),
      ] });
    res.json({ record,payrollRun,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});


  return router;
}
