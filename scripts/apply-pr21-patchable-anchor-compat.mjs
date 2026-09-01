import fs from 'node:fs';

const path = 'server/index.mjs';
let source = fs.readFileSync(path, 'utf8');
const hardened = "const PATCHABLE_COLLECTIONS = new Set(['companies', 'employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'journals']);";
const legacyAnchor = "const PATCHABLE_COLLECTIONS = new Set(['companies', 'employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'journals', 'auditLogs']);";
if (source.includes(hardened) && !source.includes(legacyAnchor)) {
  source = source.replace(hardened, legacyAnchor);
  fs.writeFileSync(path, source);
}
console.log('PR21 patchable collection anchor compatibility prepared.');
