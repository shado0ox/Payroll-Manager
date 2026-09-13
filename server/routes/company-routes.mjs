import express from 'express';

export function createCompanyRouter({ auth,writeLimiter,pool,q,can,workflowError,asArray,clone,subscriptionState,bumpStateVersion,appendStateAudit,broadcastStateUpdate }) {
  const router = express.Router();
function validateCompanyRecord(record, user, requireAssigned = true) {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id
    || record.id.length > 100 || typeof record.companyCode !== 'string' || !record.companyCode.trim() || record.companyCode.length > 50
    || typeof record.nameAr !== 'string' || !record.nameAr.trim() || record.nameAr.length > 300
    || (record.nameEn != null && (typeof record.nameEn !== 'string' || record.nameEn.length > 300))) {
    throw workflowError(400, 'INVALID_COMPANY');
  }
  if (requireAssigned && !user.company_ids.includes(record.id)) throw workflowError(403, 'FORBIDDEN');
  const departments = asArray(record.departments);
  const costCenters = asArray(record.costCenters);
  const bankDefinitions = asArray(record.bankDefinitions);
  if (departments.length > 1_000 || costCenters.length > 1_000 || bankDefinitions.length > 100) {
    throw workflowError(400, 'INVALID_COMPANY_COLLECTION_SIZE');
  }
  const validChild = item => item && typeof item === 'object' && typeof item.id === 'string' && item.id;
  if (departments.some(item => !validChild(item)) || costCenters.some(item => !validChild(item))) {
    throw workflowError(400, 'INVALID_COMPANY_STRUCTURE');
  }
  const departmentIds = new Set(departments.map(item => item.id));
  const costCenterIds = new Set(costCenters.map(item => item.id));
  if (departmentIds.size !== departments.length || costCenterIds.size !== costCenters.length) {
    throw workflowError(409, 'DUPLICATE_COMPANY_STRUCTURE_ID');
  }
  const bankCodes = new Set();
  for (const bank of bankDefinitions) {
    const code = String(bank?.ibanBankCode || '').trim();
    const swift = String(bank?.swiftCode || '').trim().toUpperCase();
    if (!/^\d{2}$/.test(code) || !String(bank?.nameAr || '').trim()
      || !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(swift) || bankCodes.has(code)) {
      throw workflowError(400, 'INVALID_COMPANY_BANK_DEFINITION');
    }
    bankCodes.add(code);
  }
}

async function updateCompanyAggregate(client, record) {
  const existing = await client.query(`SELECT id,subscription_status,trial_ends_at,subscription_ends_at
    FROM ${q('companies')} WHERE id=$1 AND is_archived=false FOR UPDATE`, [record.id]);
  if (!existing.rowCount) throw workflowError(404, 'COMPANY_NOT_FOUND');
  const payload = clone(record);
  delete payload.departments;
  delete payload.costCenters;
  delete payload.bankDefinitions;
  delete payload.subscriptionStatus;
  delete payload.trialEndsAt;
  delete payload.subscriptionEndsAt;
  await client.query(`UPDATE ${q('companies')} SET company_code=$2,name_ar=$3,name_en=$4,payload=$5::jsonb,updated_at=now()
    WHERE id=$1`, [record.id,record.companyCode.trim(),record.nameAr.trim(),String(record.nameEn || ''),JSON.stringify(payload)]);

  await client.query(`DELETE FROM ${q('company_departments')} WHERE company_id=$1`, [record.id]);
  await client.query(`DELETE FROM ${q('cost_centers')} WHERE company_id=$1`, [record.id]);
  await client.query(`DELETE FROM ${q('company_bank_definitions')} WHERE company_id=$1`, [record.id]);
  await client.query(`INSERT INTO ${q('company_departments')} (company_id,id,code,name_ar,name_en,payload,sort_order)
    SELECT $1,department->>'id',COALESCE(department->>'code',''),COALESCE(department->>'nameAr',''),
      COALESCE(department->>'nameEn',''),department,(ordinality - 1)::integer
    FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS source(department,ordinality)`, [record.id,JSON.stringify(asArray(record.departments))]);
  await client.query(`INSERT INTO ${q('cost_centers')} (company_id,id,code,name_ar,name_en,payload,sort_order)
    SELECT $1,center->>'id',COALESCE(center->>'code',''),COALESCE(center->>'nameAr',''),
      COALESCE(center->>'nameEn',''),center,(ordinality - 1)::integer
    FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS source(center,ordinality)`, [record.id,JSON.stringify(asArray(record.costCenters))]);
  await client.query(`INSERT INTO ${q('company_bank_definitions')} (company_id,iban_bank_code,name_ar,name_en,swift_code,is_active,payload,sort_order)
    SELECT $1,bank->>'ibanBankCode',COALESCE(bank->>'nameAr',''),COALESCE(bank->>'nameEn',''),
      upper(COALESCE(bank->>'swiftCode','')),COALESCE((bank->>'isActive')::boolean,true),bank,(ordinality - 1)::integer
    FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS source(bank,ordinality)`, [record.id,JSON.stringify(asArray(record.bankDefinitions))]);

  const row = existing.rows[0];
  return {
    ...record,
    subscriptionStatus:subscriptionState(row).status,
    trialEndsAt:row.trial_ends_at?.toISOString?.() || row.trial_ends_at || null,
    subscriptionEndsAt:row.subscription_ends_at?.toISOString?.() || row.subscription_ends_at || null,
  };
}

router.put('/companies/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_COMPANY_PROFILE')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    if (record.id !== req.params.id) return res.status(400).json({ error:'INVALID_COMPANY' });
    validateCompanyRecord(record,req.user);
    await client.query('BEGIN');
    const committed = await updateCompanyAggregate(client,record);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:[record.id],user:req.user,action:'UPDATE_COMPANY',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ record:committed,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    if (e?.code === '23505') return res.status(409).json({ error:'COMPANY_DUPLICATE',detail:e.constraint });
    next(e);
  } finally { client.release(); }
});

router.post('/companies', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (req.user.role !== 'ADMIN' || !can(req.user,'MANAGE_COMPANIES')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    validateCompanyRecord(record,req.user,false);
    await client.query('BEGIN');
    const existing = await client.query(`SELECT 1 FROM ${q('companies')} WHERE id=$1 OR company_code=$2 FOR UPDATE`, [record.id,record.companyCode.trim()]);
    if (existing.rowCount) throw workflowError(409,'COMPANY_DUPLICATE');
    const order = await client.query(`SELECT COALESCE(max(sort_order),-1)+1 AS sort_order FROM ${q('companies')}`);
    await client.query(`INSERT INTO ${q('companies')} (id,company_code,name_ar,name_en,payload,sort_order,is_archived)
      VALUES ($1,$2,$3,$4,'{}'::jsonb,$5,false)`, [record.id,record.companyCode.trim(),record.nameAr.trim(),String(record.nameEn || ''),Number(order.rows[0]?.sort_order || 0)]);
    const committed = await updateCompanyAggregate(client,record);
    await client.query(`UPDATE ${q('users')} SET company_ids=company_ids || jsonb_build_array($2::text),updated_at=now()
      WHERE id=$1 AND NOT (company_ids ? $2)`, [req.user.id,record.id]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:[record.id],user:req.user,action:'CREATE_COMPANY',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.status(201).json({ record:committed,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    if (e?.code === '23505') return res.status(409).json({ error:'COMPANY_DUPLICATE',detail:e.constraint });
    next(e);
  } finally { client.release(); }
});

router.delete('/companies/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (req.user.role !== 'ADMIN' || !can(req.user,'MANAGE_COMPANIES')) return res.status(403).json({ error:'FORBIDDEN' });
    if (!req.user.company_ids.includes(req.params.id)) return res.status(403).json({ error:'FORBIDDEN' });
    await client.query('BEGIN');
    const target = await client.query(`SELECT id FROM ${q('companies')} WHERE id=$1 AND is_archived=false FOR UPDATE`, [req.params.id]);
    if (!target.rowCount) throw workflowError(404,'COMPANY_NOT_FOUND');
    const remaining = await client.query(`SELECT id FROM ${q('companies')}
      WHERE id=ANY($1::text[]) AND id<>$2 AND is_archived=false ORDER BY sort_order,id`, [req.user.company_ids,req.params.id]);
    if (!remaining.rowCount) throw workflowError(409,'ONLY_MANAGED_COMPANY');
    const nextCompanyId = remaining.rows[0].id;
    await client.query(`UPDATE ${q('companies')} SET is_archived=true,updated_at=now() WHERE id=$1`, [req.params.id]);
    await client.query(`UPDATE ${q('users')} SET
      company_ids=company_ids - $1,
      is_active=CASE WHEN role<>'ADMIN' AND jsonb_array_length(company_ids - $1)=0 THEN false ELSE is_active END,
      updated_at=now()
      WHERE company_ids ? $1`, [req.params.id]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:[req.params.id],user:req.user,action:'ARCHIVE_COMPANY',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ archived:true,nextCompanyId,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

router.put('/admin/companies/:id/subscription', auth, writeLimiter, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error:'FORBIDDEN' });
    const status = String(req.body?.status || '');
    const endsAt = req.body?.endsAt ? new Date(req.body.endsAt) : null;
    if (!['TRIAL','ACTIVE','EXPIRED','SUSPENDED'].includes(status) || (endsAt && Number.isNaN(endsAt.getTime()))) return res.status(400).json({ error:'INVALID_SUBSCRIPTION' });
    const result = await pool.query(`UPDATE ${q('companies')} SET subscription_status=$2,
      trial_ends_at=CASE WHEN $2='TRIAL' THEN $3 ELSE trial_ends_at END,
      subscription_ends_at=CASE WHEN $2='ACTIVE' THEN $3 ELSE subscription_ends_at END,
      updated_at=now() WHERE id=$1 AND is_archived=false
      RETURNING id,subscription_status,trial_ends_at,subscription_ends_at`, [req.params.id,status,endsAt?.toISOString() || null]);
    if (!result.rowCount) return res.status(404).json({ error:'COMPANY_NOT_FOUND' });
    const current = await pool.query(`UPDATE ${q('app_state')} SET version=version+1,updated_by=$1,updated_at=now()
      WHERE id=1 RETURNING version,updated_at`, [req.user.id]);
    if (current.rowCount) broadcastStateUpdate({ version:current.rows[0].version,updatedBy:req.user.id,updatedAt:current.rows[0].updated_at });
    const row = result.rows[0];
    res.json({ record:{ id:row.id,subscriptionStatus:subscriptionState(row).status,
      trialEndsAt:row.trial_ends_at?.toISOString?.() || row.trial_ends_at || null,
      subscriptionEndsAt:row.subscription_ends_at?.toISOString?.() || row.subscription_ends_at || null },
      version:Number(current.rows[0]?.version || 0),updated_at:current.rows[0]?.updated_at || new Date().toISOString() });
  } catch (e) { next(e); }
});


  return router;
}
