import fs from 'node:fs';

const serverUrl = new URL('../server/index.mjs', import.meta.url);
let source = fs.readFileSync(serverUrl, 'utf8');

const before = `'totalLoanDeductions','totalPenalties','totalDeductions','totalNetSalaries','totalCompanyCost','items'`;
const after = `'totalLoanDeductions','totalPenalties','totalDeductions','totalNetSalaries','totalCompanyCost'`;

if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Missing transform anchor: payroll approved roundtrip compatibility');
  source = source.replace(before, after);
}

fs.writeFileSync(serverUrl, source);
console.log('Payroll approved roundtrip compatibility applied.');
