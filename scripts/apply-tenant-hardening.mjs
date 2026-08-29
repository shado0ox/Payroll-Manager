import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('server/index.mjs');
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (from, to, label) => {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Security patch target not found: ${label}`);
  source = source.replace(from, to);
};

replaceOnce(
  "import pg from 'pg';",
  "import pg from 'pg';\nimport { createTenantScopedClient, scopeStateForCompanies } from './tenant-storage.mjs';",
  'tenant storage import',
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

const runtimeWrites = `    const tenantCompanyIds = Array.isArray(req.user.company_ids) ? req.user.company_ids : [];
    const scopedState = scopeStateForCompanies(state, tenantCompanyIds);
    const tenantClient = createTenantScopedClient(client, q, tenantCompanyIds);
    await replaceNormalizedPayrollData(tenantClient, scopedState);
    await replaceNormalizedOperationsData(tenantClient, scopedState);
    await replaceNormalizedCoreData(tenantClient, scopedState);`;

replaceOnce(
  `    await replaceNormalizedPayrollData(client, state);
    await replaceNormalizedOperationsData(client, state);
    await replaceNormalizedCoreData(client, state);`,
  runtimeWrites,
  'tenant-scope full state PUT writes',
);

replaceOnce(
  `    await replaceNormalizedPayrollData(client, state);
    await replaceNormalizedOperationsData(client, state);
    await replaceNormalizedCoreData(client, state);`,
  runtimeWrites,
  'tenant-scope PATCH writes',
);

replaceOnce(
  "    const existing = await pool.query(`SELECT id,password_hash FROM ${q('users')} WHERE id=$1`, [req.params.id]);",
  "    const existing = await pool.query(`SELECT id,password_hash,company_ids,role FROM ${q('users')} WHERE id=$1`, [req.params.id]);\n    if (existing.rowCount) {\n      const existingCompanyIds = Array.isArray(existing.rows[0].company_ids) ? existing.rows[0].company_ids : [];\n      const targetOutsideScope = existingCompanyIds.some(id => !req.user.company_ids.includes(id));\n      if (targetOutsideScope || (req.user.role !== 'ADMIN' && existing.rows[0].role !== 'OPERATIONS_MANAGER')) {\n        return res.status(403).json({ error:'FORBIDDEN' });\n      }\n    }",
  'protect existing user from cross-tenant takeover',
);

fs.writeFileSync(file, source);
console.log('Tenant storage hardening applied to server/index.mjs');
