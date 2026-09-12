import express from 'express';

export function createAttendanceLeaveRouter({
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
  workflowError,
  bumpStateVersion,
  appendStateAudit,
  broadcastStateUpdate,
}) {
  const router = express.Router();

function validateAttendanceRecord(record, user) {
  return record && typeof record === 'object' && typeof record.id === 'string' && Boolean(record.id)
    && typeof record.companyId === 'string' && user.company_ids.includes(record.companyId)
    && typeof record.employeeId === 'string' && Boolean(record.employeeId)
    && validPeriodMonth(record.periodMonth) && validIsoDate(record.date)
    && (!record.endDate || validIsoDate(record.endDate)) && (!record.endDate || record.endDate >= record.date)
    && Number.isInteger(Number(record.daysCount ?? 1)) && Number(record.daysCount ?? 1) >= 0
    && Number.isInteger(Number(record.delayMinutes ?? 0)) && Number(record.delayMinutes ?? 0) >= 0
    && Number.isFinite(Number(record.overtimeHours ?? 0)) && Number(record.overtimeHours ?? 0) >= 0
    && ['STANDARD','WEEKEND'].includes(record.overtimeType || 'STANDARD');
}

router.put('/attendance/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_ATTENDANCE')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    if (record.id !== req.params.id || !validateAttendanceRecord(record,req.user)) {
      return res.status(400).json({ error:'INVALID_ATTENDANCE_RECORD' });
    }
    await client.query('BEGIN');
    const stored = await readLockedNormalizedState(client);
    const existingRecord = asArray(stored.attendance).find(item => item.id === record.id);
    if ((existingRecord && payrollSourceLocked(stored,'attendance',existingRecord)) || payrollSourceLocked(stored,'attendance',record)) {
      throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    }
    const employee = await client.query(`SELECT company_id FROM ${q('employees')} WHERE id=$1 AND is_archived=false`, [record.employeeId]);
    if (!employee.rowCount || employee.rows[0].company_id !== record.companyId) throw workflowError(400, 'INVALID_ATTENDANCE_EMPLOYEE');
    const existing = await client.query(`SELECT company_id,sort_order FROM ${q('attendance_records')} WHERE id=$1 FOR UPDATE`, [record.id]);
    if (existing.rowCount && existing.rows[0].company_id !== record.companyId) throw workflowError(409, 'ATTENDANCE_COMPANY_IMMUTABLE');
    const sortOrder = existing.rowCount ? existing.rows[0].sort_order : Number((await client.query(`SELECT COALESCE(min(sort_order),0)-1 AS sort_order FROM ${q('attendance_records')} WHERE company_id=$1`, [record.companyId])).rows[0]?.sort_order || 0);
    await client.query(`INSERT INTO ${q('attendance_records')} (
      id,company_id,employee_id,period_month,record_date,end_date,days_count,delay_minutes,absence,unpaid_leave,overtime_hours,overtime_type,notes,payload,sort_order,updated_at
    ) VALUES ($1,$2,$3,$4,$5::date,NULLIF($6,'')::date,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,now())
    ON CONFLICT (id) DO UPDATE SET employee_id=EXCLUDED.employee_id,period_month=EXCLUDED.period_month,
      record_date=EXCLUDED.record_date,end_date=EXCLUDED.end_date,days_count=EXCLUDED.days_count,delay_minutes=EXCLUDED.delay_minutes,
      absence=EXCLUDED.absence,unpaid_leave=EXCLUDED.unpaid_leave,overtime_hours=EXCLUDED.overtime_hours,
      overtime_type=EXCLUDED.overtime_type,notes=EXCLUDED.notes,payload=EXCLUDED.payload,updated_at=now()`, [
      record.id,record.companyId,record.employeeId,record.periodMonth,record.date,record.endDate || '',Number(record.daysCount ?? 1),
      Number(record.delayMinutes || 0),Boolean(record.absence),Boolean(record.unpaidLeave),Number(record.overtimeHours || 0),
      record.overtimeType || 'STANDARD',record.notes || null,JSON.stringify(record),sortOrder
    ]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:existing.rowCount ? 'UPDATE_ATTENDANCE' : 'CREATE_ATTENDANCE',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[record.companyId],changes:[{ collection:'attendance',operation:'upsert',records:[record] }] });
    res.json({ record,created:!existing.rowCount,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

router.post('/attendance/import', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_ATTENDANCE')) return res.status(403).json({ error:'FORBIDDEN' });
    const records = req.body?.records;
    if (!Array.isArray(records) || !records.length || records.length > 2500
      || records.some(record => !validateAttendanceRecord(record,req.user))) {
      return res.status(400).json({ error:'INVALID_ATTENDANCE_IMPORT' });
    }
    const ids = records.map(record => record.id);
    const companyIds = new Set(records.map(record => record.companyId));
    if (new Set(ids).size !== ids.length || companyIds.size !== 1) return res.status(400).json({ error:'INVALID_ATTENDANCE_IMPORT' });
    const companyId = records[0].companyId;
    await client.query('BEGIN');
    const stored = await readLockedNormalizedState(client);
    const storedById = new Map(asArray(stored.attendance).map(record => [record.id,record]));
    if (records.some(record => (storedById.has(record.id) && payrollSourceLocked(stored,'attendance',storedById.get(record.id)))
      || payrollSourceLocked(stored,'attendance',record))) {
      throw workflowError(409,'PAYROLL_SOURCE_ENTRY_LOCKED');
    }
    const employees = await client.query(`SELECT id,company_id FROM ${q('employees')} WHERE id=ANY($1::text[]) AND is_archived=false`, [[...new Set(records.map(record => record.employeeId))]]);
    const employeeCompanies = new Map(employees.rows.map(row => [row.id,row.company_id]));
    if (records.some(record => employeeCompanies.get(record.employeeId) !== companyId)) throw workflowError(400,'INVALID_ATTENDANCE_EMPLOYEE');
    const existing = await client.query(`SELECT id,company_id FROM ${q('attendance_records')} WHERE id=ANY($1::text[]) FOR UPDATE`, [ids]);
    if (existing.rows.some(row => row.company_id !== companyId)) throw workflowError(409,'ATTENDANCE_COMPANY_IMMUTABLE');
    const startOrder = Number((await client.query(`SELECT COALESCE(max(sort_order),-1)+1 AS sort_order FROM ${q('attendance_records')} WHERE company_id=$1`, [companyId])).rows[0]?.sort_order || 0);
    await client.query(`INSERT INTO ${q('attendance_records')} (
        id,company_id,employee_id,period_month,record_date,end_date,days_count,delay_minutes,absence,unpaid_leave,overtime_hours,overtime_type,notes,payload,sort_order,updated_at
      ) SELECT record->>'id',record->>'companyId',record->>'employeeId',record->>'periodMonth',(record->>'date')::date,
        NULLIF(record->>'endDate','')::date,COALESCE(NULLIF(record->>'daysCount','')::integer,1),
        COALESCE(NULLIF(record->>'delayMinutes','')::integer,0),COALESCE((record->>'absence')::boolean,false),
        COALESCE((record->>'unpaidLeave')::boolean,false),COALESCE(NULLIF(record->>'overtimeHours','')::numeric,0),
        COALESCE(NULLIF(record->>'overtimeType',''),'STANDARD'),NULLIF(record->>'notes',''),record,$2+(ordinality-1)::integer,now()
      FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(record,ordinality)
      ON CONFLICT (id) DO UPDATE SET employee_id=EXCLUDED.employee_id,period_month=EXCLUDED.period_month,
        record_date=EXCLUDED.record_date,end_date=EXCLUDED.end_date,days_count=EXCLUDED.days_count,delay_minutes=EXCLUDED.delay_minutes,
        absence=EXCLUDED.absence,unpaid_leave=EXCLUDED.unpaid_leave,overtime_hours=EXCLUDED.overtime_hours,
        overtime_type=EXCLUDED.overtime_type,notes=EXCLUDED.notes,payload=EXCLUDED.payload,updated_at=now()`, [JSON.stringify(records),startOrder]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:[companyId],user:req.user,action:`IMPORT_ATTENDANCE:${records.length}`,version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[companyId],changes:[{ collection:'attendance',operation:'upsert',records }] });
    res.status(201).json({ records,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

router.delete('/attendance/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_ATTENDANCE')) return res.status(403).json({ error:'FORBIDDEN' });
    await client.query('BEGIN');
    const row = await client.query(`SELECT company_id,payload FROM ${q('attendance_records')} WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!row.rowCount) throw workflowError(404, 'ATTENDANCE_NOT_FOUND');
    if (!req.user.company_ids.includes(row.rows[0].company_id)) throw workflowError(403, 'FORBIDDEN');
    const stored = await readLockedNormalizedState(client);
    if (payrollSourceLocked(stored,'attendance',row.rows[0].payload)) throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    await client.query(`DELETE FROM ${q('attendance_records')} WHERE id=$1`, [req.params.id]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:'DELETE_ATTENDANCE',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[row.rows[0].company_id],changes:[{ collection:'attendance',operation:'delete',ids:[req.params.id] }] });
    res.json({ deleted:true,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

function validateLeaveRecord(record, user) {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id
    || typeof record.companyId !== 'string' || !user.company_ids.includes(record.companyId)
    || typeof record.employeeId !== 'string' || !record.employeeId
    || !['ANNUAL','SICK','UNPAID','EMERGENCY','MATERNITY'].includes(record.type)
    || !validIsoDate(record.startDate) || !validIsoDate(record.endDate) || record.endDate < record.startDate
    || !Number.isInteger(Number(record.daysCount)) || Number(record.daysCount) < 1
    || !['PENDING','APPROVED','REJECTED'].includes(record.status)
    || typeof record.isPaid !== 'boolean') {
    throw workflowError(400,'INVALID_LEAVE_REQUEST');
  }
  const expectedDays = Math.floor((Date.parse(`${record.endDate}T00:00:00Z`) - Date.parse(`${record.startDate}T00:00:00Z`)) / 86_400_000) + 1;
  if (Number(record.daysCount) > expectedDays) throw workflowError(400,'INVALID_LEAVE_DAYS_COUNT');
}

router.put('/leaves/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_ATTENDANCE')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    if (record.id !== req.params.id) return res.status(400).json({ error:'INVALID_LEAVE_REQUEST' });
    validateLeaveRecord(record,req.user);
    await client.query('BEGIN');
    const employee = await client.query(`SELECT company_id FROM ${q('employees')} WHERE id=$1 AND is_archived=false`, [record.employeeId]);
    if (!employee.rowCount || employee.rows[0].company_id !== record.companyId) throw workflowError(400,'INVALID_LEAVE_EMPLOYEE');
    const existing = await client.query(`SELECT company_id,status,sort_order FROM ${q('leave_requests')} WHERE id=$1 FOR UPDATE`, [record.id]);
    if (existing.rowCount && existing.rows[0].company_id !== record.companyId) throw workflowError(409,'LEAVE_COMPANY_IMMUTABLE');
    if (existing.rowCount && existing.rows[0].status !== record.status) throw workflowError(409,'LEAVE_STATUS_ENDPOINT_REQUIRED');
    if (!existing.rowCount && record.status !== 'PENDING') throw workflowError(400,'NEW_LEAVE_MUST_BE_PENDING');
    const sortOrder = existing.rowCount ? existing.rows[0].sort_order : Number((await client.query(
      `SELECT COALESCE(min(sort_order),0)-1 AS sort_order FROM ${q('leave_requests')} WHERE company_id=$1`, [record.companyId]
    )).rows[0]?.sort_order || 0);
    await client.query(`INSERT INTO ${q('leave_requests')} (
        id,company_id,employee_id,leave_type,start_date,end_date,days_count,status,is_paid,reason,payload,sort_order,updated_at
      ) VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10,$11::jsonb,$12,now())
      ON CONFLICT (id) DO UPDATE SET employee_id=EXCLUDED.employee_id,leave_type=EXCLUDED.leave_type,
        start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,days_count=EXCLUDED.days_count,
        is_paid=EXCLUDED.is_paid,reason=EXCLUDED.reason,payload=EXCLUDED.payload,updated_at=now()`, [
      record.id,record.companyId,record.employeeId,record.type,record.startDate,record.endDate,Number(record.daysCount),
      record.status,record.isPaid,record.reason || null,JSON.stringify(record),sortOrder
    ]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:existing.rowCount ? 'UPDATE_LEAVE' : 'CREATE_LEAVE',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[record.companyId],changes:[{ collection:'leaves',operation:'upsert',records:[record] }] });
    res.json({ record,created:!existing.rowCount,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

router.patch('/leaves/:id/status', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_ATTENDANCE')) return res.status(403).json({ error:'FORBIDDEN' });
    const status = String(req.body?.status || '');
    if (!['PENDING','APPROVED','REJECTED'].includes(status)) return res.status(400).json({ error:'INVALID_LEAVE_STATUS' });
    await client.query('BEGIN');
    const existing = await client.query(`SELECT company_id,payload FROM ${q('leave_requests')} WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!existing.rowCount) throw workflowError(404,'LEAVE_NOT_FOUND');
    if (!req.user.company_ids.includes(existing.rows[0].company_id)) throw workflowError(403,'FORBIDDEN');
    if (existing.rows[0].payload?.status === status) throw workflowError(409,'LEAVE_STATUS_UNCHANGED');
    const record = { ...existing.rows[0].payload,status };
    validateLeaveRecord(record,req.user);
    await client.query(`UPDATE ${q('leave_requests')} SET status=$2,payload=$3::jsonb,updated_at=now() WHERE id=$1`, [record.id,status,JSON.stringify(record)]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:'LEAVE_STATUS_TRANSITION',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[record.companyId],changes:[{ collection:'leaves',operation:'upsert',records:[record] }] });
    res.json({ record,created:false,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});


  return router;
}

