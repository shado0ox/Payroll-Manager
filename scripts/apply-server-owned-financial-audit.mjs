import fs from 'node:fs';

function patchFile(relativePath, transform) {
  const url = new URL(`../${relativePath}`, import.meta.url);
  const source = fs.readFileSync(url, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(url, next);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Missing server-owned financial audit anchor: ${label}`);
  return source.replace(before, after);
}

patchFile('src/types/index.ts', (initial) => {
  let source = initial;
  source = replaceOnce(
    source,
    `  paymentReversedAt?: string;\n  reversedPaymentDate?: string;`,
    `  paymentReversedAt?: string;\n  paymentReversedBy?: string;\n  paymentReversedByName?: string;\n  reversedPaymentDate?: string;`,
    'payment reversal actor metadata type',
  );
  return source;
});

patchFile('server/index.mjs', (initial) => {
  let source = initial;
  source = replaceOnce(
    source,
    `import { appendStateAudit } from './state-audit.mjs';`,
    `import { appendStateAudit } from './state-audit.mjs';\nimport { appendPayrollFinancialAudit } from './payroll-financial-audit.mjs';`,
    'financial audit import',
  );

  source = replaceOnce(
    source,
    `const isAppendOnlyLoanAdjustment = (beforeLoan, afterLoan) => {`,
    `const isAppendOnlyLoanAdjustment = (beforeLoan, afterLoan, user) => {`,
    'loan adjustment validator user',
  );
  source = replaceOnce(
    source,
    `  if (afterLoan.status !== beforeLoan.status && !(expectedBalance === 0 && afterLoan.status === 'COMPLETED')) return false;\n  return true;`,
    `  if (afterLoan.status !== beforeLoan.status && !(expectedBalance === 0 && afterLoan.status === 'COMPLETED')) return false;\n  adjustment.createdAt = new Date().toISOString();\n  adjustment.createdBy = String(user?.id || '');\n  return true;`,
    'server-owned loan adjustment creator',
  );
  source = replaceOnce(
    source,
    `      if (kind === 'loan' && isAppendOnlyLoanAdjustment(beforeById.get(row.id), afterById.get(row.id))) continue;`,
    `      if (kind === 'loan' && isAppendOnlyLoanAdjustment(beforeById.get(row.id), afterById.get(row.id), user)) continue;`,
    'loan validator actor call',
  );

  source = replaceOnce(
    source,
    `          if (typeof nextBatch.paymentReversalReason !== 'string' || !nextBatch.paymentReversalReason.trim()\n            || typeof nextBatch.paymentReversedAt !== 'string' || !nextBatch.paymentReversedAt\n            || nextBatch.paymentDate != null\n            || String(nextBatch.reversedPaymentDate || '') !== String(oldBatch.paymentDate || '')) {\n            throw workflowError(409, 'PAYMENT_REVERSAL_METADATA_REQUIRED');\n          }`,
    `          if (typeof nextBatch.paymentReversalReason !== 'string' || !nextBatch.paymentReversalReason.trim()\n            || nextBatch.paymentDate != null\n            || String(nextBatch.reversedPaymentDate || '') !== String(oldBatch.paymentDate || '')) {\n            throw workflowError(409, 'PAYMENT_REVERSAL_METADATA_REQUIRED');\n          }\n          nextBatch.paymentReversedAt = new Date().toISOString();\n          nextBatch.paymentReversedBy = String(user?.id || '');\n          nextBatch.paymentReversedByName = String(user?.name || user?.username || '');`,
    'server-owned payment reversal metadata',
  );

  source = replaceOnce(
    source,
    `    state = mergeStateForUser(stored, state, req.user);\n    const tenantCompanyIds = Array.isArray(req.user.company_ids) ? req.user.company_ids : [];`,
    `    state = mergeStateForUser(stored, state, req.user);\n    await appendPayrollFinancialAudit(client, q, { stored, next:state, user:req.user });\n    const tenantCompanyIds = Array.isArray(req.user.company_ids) ? req.user.company_ids : [];`,
    'PUT financial audit',
  );
  source = replaceOnce(
    source,
    `    let state = mergeStateForUser(stored, patchedVisible, req.user);\n    if (stored.qoyodConfig?.apiKey && !state.qoyodConfig?.apiKey) {`,
    `    let state = mergeStateForUser(stored, patchedVisible, req.user);\n    await appendPayrollFinancialAudit(client, q, { stored, next:state, user:req.user });\n    if (stored.qoyodConfig?.apiKey && !state.qoyodConfig?.apiKey) {`,
    'PATCH financial audit',
  );

  return source;
});

console.log('Server-owned payroll financial audit applied.');
