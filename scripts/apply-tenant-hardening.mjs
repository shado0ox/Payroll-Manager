import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('server/index.mjs');
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (from, to, label) => {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Security patch target not found: ${label}`);
  source = source.replace(from, to);
};

const replaceExactly = (from, to, expectedCount, label) => {
  const currentCount = source.split(from).length - 1;
  const hardenedCount = source.split(to).length - 1;
  if (currentCount === 0 && hardenedCount === expectedCount) return;
  if (currentCount !== expectedCount) {
    throw new Error(`Security patch target count mismatch for ${label}: expected ${expectedCount}, found ${currentCount}`);
  }
  source = source.split(from).join(to);
};

replaceOnce(
  "import pg from 'pg';",
  "import pg from 'pg';\nimport { createTenantScopedClient, scopeStateForCompanies } from './tenant-storage.mjs';\nimport { appendStateAudit } from './state-audit.mjs';",
  'tenant storage and audit imports',
);

replaceOnce(
  "const PATCHABLE_COLLECTIONS = new Set(['companies', 'employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'journals', 'auditLogs']);",
  "const PATCHABLE_COLLECTIONS = new Set(['companies', 'employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'journals']);",
  'remove client audit log patching',
);

replaceOnce(
  "    next.auditLogs = mergeCompanyScoped(stored?.auditLogs,incoming?.auditLogs,assigned);",
  "    next.auditLogs = stored?.auditLogs || [];",
  'make admin audit history server-owned',
);

replaceOnce(
  "  // Integration secrets must never be returned to the browser.\n  if (state.qoyodConfig && typeof state.qoyodConfig === 'object') {\n    state.qoyodConfig = { ...state.qoyodConfig, apiKey: '', apiKeyConfigured: Boolean(state.qoyodConfig.apiKey) };\n  }",
  "  // Each company has its own Qoyod configuration. Only expose the active assigned company's public settings.\n  const integrationCompanyId = state.activeCompanyId && assigned.has(state.activeCompanyId)\n    ? state.activeCompanyId\n    : ([...assigned][0] || '');\n  if (integrationCompanyId) state.activeCompanyId = integrationCompanyId;\n  const activeQoyodConfig = state.qoyodConfigsByCompany?.[integrationCompanyId] || {};\n  delete state.qoyodConfigsByCompany;\n  state.qoyodConfig = { ...activeQoyodConfig, apiKey: '', apiKeyConfigured: Boolean(activeQoyodConfig.apiKey) };",
  'expose only active company Qoyod config',
);

replaceOnce(
  "  next.qoyodConfig = stored?.qoyodConfig || {};",
  "  next.qoyodConfig = can(user, 'MANAGE_JOURNALS') ? (incoming?.qoyodConfig || {}) : {};",
  'allow tenant manager to update own Qoyod config',
);

replaceOnce(
  "  const qoyodConfig = state?.qoyodConfig && typeof state.qoyodConfig === 'object' ? state.qoyodConfig : {};",
  "  const qoyodConfig = state?.qoyodConfig && typeof state.qoyodConfig === 'object' ? state.qoyodConfig : {};\n  const companyIdsForConfig = new Set(companies.map(company => String(company?.id || '')).filter(Boolean));\n  const requestedQoyodCompanyId = String(state?.activeCompanyId || '');\n  const qoyodCompanyId = companyIdsForConfig.has(requestedQoyodCompanyId)\n    ? requestedQoyodCompanyId\n    : (String(companies[0]?.id || ''));",
  'derive Qoyod company from scoped state',
);

replaceOnce(
  "  const { apiKey = '', apiKeyConfigured: _ignored, ...publicConfig } = qoyodConfig;\n  await client.query(`INSERT INTO ${q('integration_configs')} (provider,public_config,secret_value,updated_at)\n    VALUES ('QOYOD',$1::jsonb,$2,now())\n    ON CONFLICT (provider) DO UPDATE SET public_config=EXCLUDED.public_config,\n      secret_value=CASE WHEN EXCLUDED.secret_value <> '' THEN EXCLUDED.secret_value ELSE ${q('integration_configs')}.secret_value END,\n      updated_at=now()`, [JSON.stringify(publicConfig), String(apiKey || '')]);",
  "  const { apiKey = '', apiKeyConfigured: _ignored, ...publicConfig } = qoyodConfig;\n  if (qoyodCompanyId) {\n    await client.query(`INSERT INTO ${q('integration_configs')} (company_id,provider,public_config,secret_value,updated_at)\n      VALUES ($1,'QOYOD',$2::jsonb,$3,now())\n      ON CONFLICT (company_id,provider) DO UPDATE SET public_config=EXCLUDED.public_config,\n        secret_value=CASE WHEN EXCLUDED.secret_value <> '' THEN EXCLUDED.secret_value ELSE ${q('integration_configs')}.secret_value END,\n        updated_at=now()`, [qoyodCompanyId, JSON.stringify(publicConfig), String(apiKey || '')]);\n  }",
  'persist Qoyod config per company',
);

replaceOnce(
  "    client.query(`SELECT public_config,secret_value FROM ${q('integration_configs')} WHERE provider='QOYOD'`),",
  "    client.query(`SELECT company_id,public_config,secret_value FROM ${q('integration_configs')} WHERE provider='QOYOD'`),",
  'hydrate company-scoped Qoyod configs',
);

replaceOnce(
  "  if (integration.rowCount) {\n    state.qoyodConfig = { ...integration.rows[0].public_config, apiKey: integration.rows[0].secret_value || '' };\n  }",
  "  state.qoyodConfigsByCompany = Object.fromEntries(integration.rows\n    .filter(row => row.company_id)\n    .map(row => [row.company_id, { ...row.public_config, apiKey: row.secret_value || '' }]));",
  'store Qoyod configs by company server-side',
);

replaceOnce(
  "  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('integration_configs')} (\n    provider text PRIMARY KEY, public_config jsonb NOT NULL DEFAULT '{}'::jsonb, secret_value text NOT NULL DEFAULT '',\n    updated_at timestamptz NOT NULL DEFAULT now(), CHECK (provider IN ('QOYOD'))\n  )`);",
  "  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('integration_configs')} (\n    provider text PRIMARY KEY, public_config jsonb NOT NULL DEFAULT '{}'::jsonb, secret_value text NOT NULL DEFAULT '',\n    updated_at timestamptz NOT NULL DEFAULT now(), CHECK (provider IN ('QOYOD'))\n  )`);\n  await pool.query(`ALTER TABLE ${q('integration_configs')} ADD COLUMN IF NOT EXISTS company_id text`);\n  await pool.query(`UPDATE ${q('integration_configs')} SET company_id=$1 WHERE company_id IS NULL`, [process.env.COMPANY_ID]);\n  await pool.query(`ALTER TABLE ${q('integration_configs')} ALTER COLUMN company_id SET NOT NULL`);\n  const integrationPk = await pool.query(`SELECT pg_get_constraintdef(oid) definition FROM pg_constraint\n    WHERE conrelid=$1::regclass AND contype='p'`, [q('integration_configs')]);\n  if (integrationPk.rows[0]?.definition === 'PRIMARY KEY (provider)') {\n    await pool.query(`ALTER TABLE ${q('integration_configs')} DROP CONSTRAINT integration_configs_pkey`);\n  }\n  const integrationPkAfter = await pool.query(`SELECT 1 FROM pg_constraint WHERE conrelid=$1::regclass AND contype='p'`, [q('integration_configs')]);\n  if (!integrationPkAfter.rowCount) {\n    await pool.query(`ALTER TABLE ${q('integration_configs')} ADD CONSTRAINT integration_configs_pkey PRIMARY KEY (company_id,provider)`);\n  }",
  'migrate integration configs to company scope',
);

replaceOnce(
  "    const configResult = await pool.query(`SELECT public_config,secret_value FROM ${q('integration_configs')} WHERE provider='QOYOD'`);",
  "    const configResult = await pool.query(`SELECT public_config,secret_value FROM ${q('integration_configs')} WHERE company_id=$1 AND provider='QOYOD'`, [companyId]);",
  'use company Qoyod credential for journal sync',
);

const rawRuntimeWrites = `    await replaceNormalizedPayrollData(client, state);
    await replaceNormalizedOperationsData(client, state);
    await replaceNormalizedCoreData(client, state);`;
const runtimeWrites = `    const tenantCompanyIds = Array.isArray(req.user.company_ids) ? req.user.company_ids : [];
    const scopedState = scopeStateForCompanies(state, tenantCompanyIds);
    const tenantClient = createTenantScopedClient(client, q, tenantCompanyIds);
    await replaceNormalizedPayrollData(tenantClient, scopedState);
    await replaceNormalizedOperationsData(tenantClient, scopedState);
    await replaceNormalizedCoreData(tenantClient, scopedState);`;

replaceExactly(rawRuntimeWrites, runtimeWrites, 2, 'tenant-scope PUT and PATCH writes');

replaceOnce(
  "    await client.query(`INSERT INTO ${q('app_state_migration_backups')} (source_version,state,reason)\n      SELECT $1,$2::jsonb,'Normalized storage baseline'\n      WHERE NOT EXISTS (SELECT 1 FROM ${q('app_state_migration_backups')})\n      ON CONFLICT (source_version) DO NOTHING`,\n      [r.rows[0].version, JSON.stringify(compatibilityState)]);\n    await client.query('COMMIT');",
  "    await client.query(`INSERT INTO ${q('app_state_migration_backups')} (source_version,state,reason)\n      SELECT $1,$2::jsonb,'Normalized storage baseline'\n      WHERE NOT EXISTS (SELECT 1 FROM ${q('app_state_migration_backups')})\n      ON CONFLICT (source_version) DO NOTHING`,\n      [r.rows[0].version, JSON.stringify(compatibilityState)]);\n    await appendStateAudit(client, q, { companyIds:req.user.company_ids, user:req.user, action:'STATE_REPLACE', version:r.rows[0].version });\n    await client.query('COMMIT');",
  'append server audit for state replace',
);

replaceOnce(
  "    const result = await client.query(`UPDATE ${q('app_state')}\n      SET state=$1::jsonb,version=version+1,updated_by=$2,updated_at=now()\n      WHERE id=1 RETURNING version,updated_at`, [JSON.stringify(compatibilityState), req.user.id]);\n    await client.query('COMMIT');",
  "    const result = await client.query(`UPDATE ${q('app_state')}\n      SET state=$1::jsonb,version=version+1,updated_by=$2,updated_at=now()\n      WHERE id=1 RETURNING version,updated_at`, [JSON.stringify(compatibilityState), req.user.id]);\n    await appendStateAudit(client, q, { companyIds:req.user.company_ids, user:req.user, action:'STATE_PATCH', version:result.rows[0].version });\n    await client.query('COMMIT');",
  'append server audit for state patch',
);

replaceOnce(
  "    const existing = await pool.query(`SELECT id,password_hash FROM ${q('users')} WHERE id=$1`, [req.params.id]);",
  "    const existing = await pool.query(`SELECT id,password_hash,company_ids,role FROM ${q('users')} WHERE id=$1`, [req.params.id]);\n    if (existing.rowCount) {\n      const existingCompanyIds = Array.isArray(existing.rows[0].company_ids) ? existing.rows[0].company_ids : [];\n      const targetOutsideScope = existingCompanyIds.some(id => !req.user.company_ids.includes(id));\n      if (targetOutsideScope || (req.user.role !== 'ADMIN' && existing.rows[0].role !== 'OPERATIONS_MANAGER')) {\n        return res.status(403).json({ error:'FORBIDDEN' });\n      }\n    }",
  'protect existing user from cross-tenant takeover',
);

fs.writeFileSync(file, source);
console.log('Tenant storage hardening applied to server/index.mjs');