import express from 'express';

export function createJournalQoyodRouter({
  auth,
  writeLimiter,
  pool,
  q,
  can,
  validPeriodMonth,
  validIsoDate,
  workflowError,
  sameJson,
  clone,
  bumpStateVersion,
  appendStateAudit,
  broadcastStateUpdate,
}) {
  const router = express.Router();

function validateQoyodConfig(companyId, config, user) {
  if (!companyId || !user.company_ids.includes(companyId)) throw workflowError(403, 'FORBIDDEN');
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw workflowError(400, 'INVALID_QOYOD_CONFIG');
  if ((config.apiKey != null && typeof config.apiKey !== 'string') || String(config.apiKey || '').length > 1_000
    || (config.organizationId != null && typeof config.organizationId !== 'string') || String(config.organizationId || '').length > 200
    || (config.autoSyncOnApprove != null && typeof config.autoSyncOnApprove !== 'boolean')
    || (config.lastTestStatus != null && !['SUCCESS','FAILED'].includes(config.lastTestStatus))
    || (config.lastTestMessage != null && (typeof config.lastTestMessage !== 'string' || config.lastTestMessage.length > 1_000))) {
    throw workflowError(400, 'INVALID_QOYOD_CONFIG');
  }
  let baseUrl;
  try { baseUrl = new URL(String(config.baseUrl || '')); }
  catch { throw workflowError(400, 'INVALID_QOYOD_URL'); }
  if (baseUrl.protocol !== 'https:' || baseUrl.hostname !== 'api.qoyod.com') {
    throw workflowError(400, 'INVALID_QOYOD_URL');
  }
  return {
    apiKey:String(config.apiKey || '').trim(),
    baseUrl:baseUrl.toString().replace(/\/$/,''),
    organizationId:String(config.organizationId || '').trim(),
    autoSyncOnApprove:config.autoSyncOnApprove === true,
    ...(config.lastTestStatus ? { lastTestStatus:config.lastTestStatus } : {}),
    ...(config.lastTestMessage != null ? { lastTestMessage:config.lastTestMessage } : {}),
  };
}

function validateJournalRecord(record, user) {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id
    || typeof record.companyId !== 'string' || !user.company_ids.includes(record.companyId)
    || typeof record.payrollRunId !== 'string' || !record.payrollRunId
    || !validPeriodMonth(record.periodMonth) || !validIsoDate(record.date)
    || typeof record.batchNumber !== 'string' || !record.batchNumber.trim()
    || typeof record.description !== 'string' || !record.description.trim()
    || !['DRAFT','EXPORTED_TO_QOYOD','POSTED'].includes(record.status)
    || (record.status === 'POSTED' && (!record.qoyodSyncStatus?.synced || !String(record.qoyodSyncStatus?.qoyodJournalId || '').trim()))
    || !Array.isArray(record.lines) || !record.lines.length
    || !Number.isFinite(Number(record.totalDebit)) || !Number.isFinite(Number(record.totalCredit))) {
    throw workflowError(400,'INVALID_JOURNAL_RECORD');
  }
  const lineIds = new Set();
  let debit = 0;
  let credit = 0;
  for (const line of record.lines) {
    const lineDebit = Number(line?.debit);
    const lineCredit = Number(line?.credit);
    if (!line || typeof line.id !== 'string' || !line.id || lineIds.has(line.id)
      || typeof line.accountCode !== 'string' || !line.accountCode.trim()
      || typeof line.accountNameAr !== 'string' || !line.accountNameAr.trim()
      || typeof line.descriptionAr !== 'string'
      || !Number.isFinite(lineDebit) || !Number.isFinite(lineCredit)
      || lineDebit < 0 || lineCredit < 0 || (lineDebit > 0 && lineCredit > 0) || (lineDebit === 0 && lineCredit === 0)) {
      throw workflowError(400,'INVALID_JOURNAL_LINE');
    }
    lineIds.add(line.id);
    debit += lineDebit;
    credit += lineCredit;
  }
  if (Math.abs(debit - credit) >= 0.01
    || Math.abs(debit - Number(record.totalDebit)) >= 0.01
    || Math.abs(credit - Number(record.totalCredit)) >= 0.01) {
    throw workflowError(400,'UNBALANCED_JOURNAL');
  }
}

async function upsertJournalAggregate(client, record) {
  const existing = await client.query(`SELECT company_id,status,payload,sort_order FROM ${q('journal_batches')} WHERE id=$1 FOR UPDATE`, [record.id]);
  if (existing.rowCount && existing.rows[0].company_id !== record.companyId) throw workflowError(409,'JOURNAL_COMPANY_IMMUTABLE');
  if (existing.rows[0]?.status === 'POSTED' && !sameJson(existing.rows[0].payload, { ...record,lines:undefined })) {
    throw workflowError(409,'POSTED_JOURNAL_IMMUTABLE');
  }
  const run = await client.query(`SELECT company_id,period_month FROM ${q('payroll_runs')} WHERE id=$1`, [record.payrollRunId]);
  if (!run.rowCount || run.rows[0].company_id !== record.companyId || run.rows[0].period_month !== record.periodMonth) {
    throw workflowError(400,'INVALID_JOURNAL_PAYROLL_RUN');
  }
  const sortOrder = existing.rowCount ? existing.rows[0].sort_order : Number((await client.query(
    `SELECT COALESCE(min(sort_order),0)-1 AS sort_order FROM ${q('journal_batches')} WHERE company_id=$1`, [record.companyId]
  )).rows[0]?.sort_order || 0);
  const payload = clone(record);
  delete payload.lines;
  await client.query(`INSERT INTO ${q('journal_batches')} (
      id,company_id,payroll_run_id,period_month,batch_number,journal_date,description,status,total_debit,total_credit,payload,sort_order,updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11::jsonb,$12,now())
    ON CONFLICT (id) DO UPDATE SET payroll_run_id=EXCLUDED.payroll_run_id,period_month=EXCLUDED.period_month,
      batch_number=EXCLUDED.batch_number,journal_date=EXCLUDED.journal_date,description=EXCLUDED.description,status=EXCLUDED.status,
      total_debit=EXCLUDED.total_debit,total_credit=EXCLUDED.total_credit,payload=EXCLUDED.payload,updated_at=now()`, [
    record.id,record.companyId,record.payrollRunId,record.periodMonth,record.batchNumber,record.date,record.description,
    record.status,Number(record.totalDebit),Number(record.totalCredit),JSON.stringify(payload),sortOrder
  ]);
  await client.query(`DELETE FROM ${q('journal_lines')} WHERE journal_batch_id=$1`, [record.id]);
  await client.query(`INSERT INTO ${q('journal_lines')} (
      journal_batch_id,id,account_code,account_name_ar,description_ar,debit,credit,cost_center_code,payload,sort_order
    ) SELECT $1,line->>'id',line->>'accountCode',line->>'accountNameAr',COALESCE(line->>'descriptionAr',''),
      COALESCE(NULLIF(line->>'debit','')::numeric,0),COALESCE(NULLIF(line->>'credit','')::numeric,0),
      NULLIF(line->>'costCenterCode',''),line,(ordinality-1)::integer
      FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS source(line,ordinality)`, [record.id,JSON.stringify(record.lines)]);
  return existing.rowCount > 0;
}


router.put('/journals/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_JOURNALS')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    if (record.id !== req.params.id) return res.status(400).json({ error:'INVALID_JOURNAL_RECORD' });
    validateJournalRecord(record,req.user);
    await client.query('BEGIN');
    const existed = await upsertJournalAggregate(client,record);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:existed ? 'UPDATE_JOURNAL' : 'CREATE_JOURNAL',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[record.companyId],changes:[{ collection:'journals',operation:'upsert',records:[record] }] });
    res.json({ record,created:!existed,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    if (e?.code === '23505') return res.status(409).json({ error:'JOURNAL_DUPLICATE',detail:e.constraint });
    next(e);
  } finally { client.release(); }
});

router.delete('/journals/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_JOURNALS')) return res.status(403).json({ error:'FORBIDDEN' });
    await client.query('BEGIN');
    const row = await client.query(`SELECT company_id,status FROM ${q('journal_batches')} WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!row.rowCount) throw workflowError(404,'JOURNAL_NOT_FOUND');
    if (!req.user.company_ids.includes(row.rows[0].company_id)) throw workflowError(403,'FORBIDDEN');
    if (row.rows[0].status === 'POSTED') throw workflowError(409,'POSTED_JOURNAL_IMMUTABLE');
    await client.query(`DELETE FROM ${q('journal_batches')} WHERE id=$1`, [req.params.id]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:'DELETE_JOURNAL',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[row.rows[0].company_id],changes:[{ collection:'journals',operation:'delete',ids:[req.params.id] }] });
    res.json({ deleted:true,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

router.put('/integrations/qoyod/config', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_JOURNALS')) return res.status(403).json({ error:'FORBIDDEN' });
    const companyId = String(req.body?.companyId || '');
    const config = validateQoyodConfig(companyId,req.body?.config,req.user);
    const { apiKey,apiKeyConfigured:_ignored,...publicConfig } = config;
    await client.query('BEGIN');
    const saved = await client.query(`INSERT INTO ${q('integration_configs')} (company_id,provider,public_config,secret_value,updated_at)
      VALUES ($1,'QOYOD',$2::jsonb,$3,now())
      ON CONFLICT (company_id,provider) DO UPDATE SET public_config=EXCLUDED.public_config,
        secret_value=CASE WHEN EXCLUDED.secret_value <> '' THEN EXCLUDED.secret_value ELSE ${q('integration_configs')}.secret_value END,
        updated_at=now()
      RETURNING public_config,(secret_value <> '') AS api_key_configured`, [companyId,JSON.stringify(publicConfig),apiKey.trim()]);
    const record = { ...saved.rows[0].public_config,apiKey:'',apiKeyConfigured:saved.rows[0].api_key_configured };
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:[companyId],user:req.user,action:'UPDATE_QOYOD_CONFIG',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ record,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

router.post('/integrations/qoyod/journal', auth, writeLimiter, async (req, res, next) => {
  try {
    if (!can(req.user, 'MANAGE_JOURNALS')) return res.status(403).json({ error:'FORBIDDEN' });
    const companyId = String(req.body?.companyId || '');
    if (!companyId || !req.user.company_ids.includes(companyId)) {
      return res.status(403).json({ error:'FORBIDDEN' });
    }
    const configResult = await pool.query(`SELECT public_config,secret_value FROM ${q('integration_configs')} WHERE company_id=$1 AND provider='QOYOD'`, [companyId]);
    const config = configResult.rows[0]?.public_config || {};
    const apiKey = String(configResult.rows[0]?.secret_value || '').trim();
    if (apiKey.length < 5) return res.status(400).json({ error:'QOYOD_NOT_CONFIGURED' });
    const baseUrl = new URL(String(config.baseUrl || 'https://api.qoyod.com/2.0'));
    if (baseUrl.protocol !== 'https:' || baseUrl.hostname !== 'api.qoyod.com') {
      return res.status(400).json({ error:'INVALID_QOYOD_URL' });
    }
    const payload = req.body?.payload;
    if (!payload?.journal_entry || !Array.isArray(payload.journal_entry.debit_amounts) || !Array.isArray(payload.journal_entry.credit_amounts)) {
      return res.status(400).json({ error:'INVALID_QOYOD_PAYLOAD' });
    }
    const response = await fetch(`${baseUrl.toString().replace(/\/+$/, '')}/journal_entries`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'API-KEY':apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message:text.slice(0, 500) }; }
    await pool.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,$2,$3)`, [
      req.user.id, response.ok ? `QOYOD_JOURNAL_SYNC:${companyId}` : `QOYOD_JOURNAL_FAILED:${companyId}:${response.status}`, req.ip,
    ]);
    if (!response.ok) return res.status(502).json({ error:'QOYOD_REQUEST_FAILED', upstreamStatus:response.status, message:data?.message || data?.error || 'Qoyod rejected the request' });
    res.json(data);
  } catch (e) { next(e); }
});


  return router;
}
