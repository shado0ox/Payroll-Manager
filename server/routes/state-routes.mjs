import express from 'express';

export function createStateRouter({ auth,writeLimiter,pool,q,buildId,clone,permissionsFor,publicStateForUser,readNormalizedApplicationState,mergeStateForUser,scopeStateForCompanies,createTenantScopedClient,replaceNormalizedPayrollData,replaceNormalizedOperationsData,replaceNormalizedCoreData,appendPayrollFinancialAudit,appendStateAudit,broadcastStateUpdate,addStateEventClient }) {
  const router = express.Router();

  router.get('/state/events', auth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(`event: ready\ndata: ${JSON.stringify({ connected:true,buildId })}\n\n`);
    const eventClient = { response:res,userId:req.user.id,companyIds:new Set(Array.isArray(req.user.company_ids) ? req.user.company_ids : []) };
    const removeClient = addStateEventClient(eventClient);
    const heartbeat = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch {} }, 25_000);
    const recycle = setTimeout(() => { removeClient(); res.end(); }, 5 * 60_000);
    req.on('close', () => { clearInterval(heartbeat); clearTimeout(recycle); removeClient(); });
  });

  router.get('/state', auth, async (req, res, next) => {
    try {
      const [r, userResult] = await Promise.all([
        pool.query(`SELECT version,updated_at FROM ${q('app_state')} WHERE id=1`),
        pool.query(`SELECT id,username,name,email,phone,role,company_ids,permissions,is_active,created_at,last_login FROM ${q('users')} ORDER BY created_at`),
      ]);
      const state = publicStateForUser(await readNormalizedApplicationState(pool), req.user);
      const visibleCompanyIds = new Set(Array.isArray(req.user.company_ids) ? req.user.company_ids : []);
      state.users = userResult.rows
        .filter(user => Array.isArray(user.company_ids) && user.company_ids.some(id => visibleCompanyIds.has(id)))
        .map(user => ({ id:user.id,username:user.username,name:user.name,email:user.email,phone:user.phone,role:user.role,
          companyIds:user.company_ids,permissions:permissionsFor(user),isActive:user.is_active,createdAt:user.created_at,lastLogin:user.last_login }));
      res.json({ version:Number(r.rows[0]?.version || 0),updated_at:r.rows[0]?.updated_at || null,state });
    } catch (e) { next(e); }
  });

  const stateForRestoreSnapshot = (rawState) => {
    const snapshot = clone(rawState || {});
    delete snapshot.currentUser;
    delete snapshot.users;
    if (snapshot.qoyodConfig && typeof snapshot.qoyodConfig === 'object') snapshot.qoyodConfig = { ...snapshot.qoyodConfig,apiKey:'',apiKeyConfigured:Boolean(snapshot.qoyodConfig.apiKey) };
    if (snapshot.qoyodConfigsByCompany && typeof snapshot.qoyodConfigsByCompany === 'object') {
      snapshot.qoyodConfigsByCompany = Object.fromEntries(Object.entries(snapshot.qoyodConfigsByCompany).map(([companyId, config]) => [
        companyId,{ ...(config || {}),apiKey:'',apiKeyConfigured:Boolean(config?.apiKey) },
      ]));
    }
    return snapshot;
  };

  router.put('/state', auth, writeLimiter, async (req, res, next) => {
    const client = await pool.connect();
    try {
      if (req.user.id !== 'user-admin') return res.status(403).json({ error:'DEVELOPER_ONLY' });
      if (req.body?.operation !== 'RESTORE_BACKUP') return res.status(400).json({ error:'EXPLICIT_RESTORE_CONFIRMATION_REQUIRED' });
      let state = clone(req.body?.state);
      const expectedVersion = Number(req.body?.version || 0);
      if (!state || typeof state !== 'object' || Array.isArray(state)) return res.status(400).json({ error:'INVALID_STATE' });
      delete state.currentUser;
      if (Array.isArray(state.users)) state.users = state.users.map(({ password, ...u }) => u);
      await client.query('BEGIN');
      const current = await client.query(`SELECT version FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
      const currentVersion = Number(current.rows[0]?.version || 0);
      if (currentVersion !== expectedVersion) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error:'STATE_CONFLICT_RELOAD_REQUIRED' });
      }
      const normalizedStored = await readNormalizedApplicationState(client);
      const assignedCompanyIds = new Set(Array.isArray(req.user.company_ids) ? req.user.company_ids : []);
      const requestedCompanyId = String(state.activeCompanyId || '');
      const activeCompanyId = assignedCompanyIds.has(requestedCompanyId) ? requestedCompanyId : String(req.user.company_ids?.[0] || '');
      const stored = { ...normalizedStored,activeCompanyId,qoyodConfig:normalizedStored.qoyodConfigsByCompany?.[activeCompanyId] || {} };
      delete stored.qoyodConfigsByCompany;
      if (stored.qoyodConfig?.apiKey && !state.qoyodConfig?.apiKey) state.qoyodConfig = { ...(state.qoyodConfig || {}),apiKey:stored.qoyodConfig.apiKey };
      delete state.qoyodConfig?.apiKeyConfigured;
      state = mergeStateForUser(stored, state, req.user);
      await client.query(`INSERT INTO ${q('app_state_restore_snapshots')} (source_version,state,created_by,reason)
        VALUES ($1,$2::jsonb,$3,'Before explicit developer backup restore')`, [currentVersion,JSON.stringify(stateForRestoreSnapshot(normalizedStored)),req.user.id]);
      await appendPayrollFinancialAudit(client, q, { stored,next:state,user:req.user });
      const tenantCompanyIds = Array.isArray(req.user.company_ids) ? req.user.company_ids : [];
      const scopedState = scopeStateForCompanies(state, tenantCompanyIds);
      const tenantClient = createTenantScopedClient(client, q, tenantCompanyIds);
      await replaceNormalizedPayrollData(tenantClient, scopedState);
      await replaceNormalizedOperationsData(tenantClient, scopedState);
      await replaceNormalizedCoreData(tenantClient, scopedState);
      const r = current.rowCount
        ? await client.query(`UPDATE ${q('app_state')} SET version=version+1,updated_by=$1,updated_at=now() WHERE id=1 RETURNING version,updated_at`, [req.user.id])
        : await client.query(`INSERT INTO ${q('app_state')} (id,version,updated_by) VALUES (1,1,$1) RETURNING version,updated_at`, [req.user.id]);
      await appendStateAudit(client, q, { companyIds:req.user.company_ids,user:req.user,action:'STATE_REPLACE',version:r.rows[0].version });
      await client.query('COMMIT');
      broadcastStateUpdate({ version:r.rows[0].version,updatedBy:req.user.id,updatedAt:r.rows[0].updated_at });
      res.json(r.rows[0]);
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
      if (e?.code === '23505') return res.status(409).json({ error:'NORMALIZED_DATA_DUPLICATE',detail:e.constraint });
      next(e);
    } finally { client.release(); }
  });

  return router;
}
