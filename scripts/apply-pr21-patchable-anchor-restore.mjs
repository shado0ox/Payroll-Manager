import fs from 'node:fs';

const path = 'server/index.mjs';
let source = fs.readFileSync(path, 'utf8');
const unsafe = "const PATCHABLE_COLLECTIONS = new Set(['companies', 'employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'payrollSettlements', 'journals', 'auditLogs']);";
const safe = "const PATCHABLE_COLLECTIONS = new Set(['companies', 'employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'payrollSettlements', 'journals']);";
if (source.includes(unsafe)) source = source.replace(unsafe, safe);
if (!source.includes(safe)) throw new Error('PR21 safe PATCHABLE_COLLECTIONS result not found');
fs.writeFileSync(path, source);
console.log('PR21 patchable collection restored with server-owned audit logs.');
