import fs from 'node:fs';

const serverUrl = new URL('../server/index.mjs', import.meta.url);
let source = fs.readFileSync(serverUrl, 'utf8');

const before = `const payrollFinancialCore = (run) => {\n  if (!run || typeof run !== 'object') return run;\n  const keys = [\n    'companyId','periodMonth','startDate','endDate','employeesCount','totalBaseSalaries','totalAllowances','totalOvertime',\n    'totalGrossSalaries','totalAbsenceDeductions','totalDelayDeductions','totalGosiEmployee','totalGosiEmployer',\n    'totalLoanDeductions','totalPenalties','totalDeductions','totalNetSalaries','totalCompanyCost','items'\n  ];\n  return Object.fromEntries(keys.map(key => [key, run[key] ?? null]));\n};`;

const after = `const payrollFinancialCore = (run) => {\n  if (!run || typeof run !== 'object') return run;\n  const number = (value) => Number(value ?? 0);\n  const text = (value) => String(value ?? '');\n  return {\n    companyId:text(run.companyId), periodMonth:text(run.periodMonth), startDate:text(run.startDate), endDate:text(run.endDate),\n    employeesCount:number(run.employeesCount), totalBaseSalaries:number(run.totalBaseSalaries),\n    totalAllowances:number(run.totalAllowances), totalOvertime:number(run.totalOvertime),\n    totalGrossSalaries:number(run.totalGrossSalaries), totalAbsenceDeductions:number(run.totalAbsenceDeductions),\n    totalDelayDeductions:number(run.totalDelayDeductions), totalGosiEmployee:number(run.totalGosiEmployee),\n    totalGosiEmployer:number(run.totalGosiEmployer), totalLoanDeductions:number(run.totalLoanDeductions),\n    totalPenalties:number(run.totalPenalties), totalDeductions:number(run.totalDeductions),\n    totalNetSalaries:number(run.totalNetSalaries), totalCompanyCost:number(run.totalCompanyCost),\n  };\n};`;

const previousAfter = `const payrollFinancialCore = (run) => {\n  if (!run || typeof run !== 'object') return run;\n  const keys = [\n    'companyId','periodMonth','startDate','endDate','employeesCount','totalBaseSalaries','totalAllowances','totalOvertime',\n    'totalGrossSalaries','totalAbsenceDeductions','totalDelayDeductions','totalGosiEmployee','totalGosiEmployer',\n    'totalLoanDeductions','totalPenalties','totalDeductions','totalNetSalaries','totalCompanyCost'\n  ];\n  return Object.fromEntries(keys.map(key => [key, run[key] ?? null]));\n};`;

if (!source.includes(after)) {
  if (source.includes(before)) source = source.replace(before, after);
  else if (source.includes(previousAfter)) source = source.replace(previousAfter, after);
  else throw new Error('Missing transform anchor: payroll approved roundtrip canonical comparison');
}

fs.writeFileSync(serverUrl, source);
console.log('Payroll approved roundtrip canonical comparison applied.');
