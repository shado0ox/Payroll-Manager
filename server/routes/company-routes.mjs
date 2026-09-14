import express from 'express';
import { createCompanyRecordService } from '../company-record-service.mjs';

export function createCompanyRouter({ auth,writeLimiter,pool,q,can,workflowError,asArray,clone,subscriptionState,bumpStateVersion,apconst { validateCompanyRecord,updateCompanyAggregate } = createCompanyRecordService({
  q,asArray,clone,subscriptionState,workflowError,
});

ption_ends_at?.toISOString?.() || row.subscription_ends_at || null,
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
