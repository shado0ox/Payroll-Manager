import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
import { buildPayrollRepairPlan } from './payroll-data-repair.mjs';

const bundle=await build({entryPoints:['src/utils/payrollEngine.ts'],bundle:true,format:'esm',platform:'node',write:false});
const engine=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('a sponsorship transfer on September 8 earns exactly eight days in September',()=>{
  const item=engine.calculateEmployeePayrollItem({
    employee:{id:'e1',employeeNo:'E1',firstNameAr:'موظف',lastNameAr:'منقول',firstNameEn:'',lastNameEn:'',department:'',nationality:'NON_SAUDI',status:'TERMINATED',employmentEndReason:'SPONSOR_TRANSFER',terminationDate:'2026-09-08',hireDate:'2025-01-01',bankIban:'',bankName:'',gosiEnabled:false,salaryPackage:{baseSalary:2400,housingAllowance:0,transportAllowance:0,otherFixedAllowances:0,nonGosiOtherAllowances:0,customAllowances:[],customDeductions:[]}},
    company:{id:'c1',workDaysPerMonth:30,workHoursPerDay:8,bankDefinitions:[],calculationRules:{dailyRateFormula:'BASE_ONLY',hourlyRateDivisor:8,workDaysDivisor:30,delayGracePeriodMinutes:15,delayDeductionMultiplier:1,absenceDayMultiplier:1,unpaidLeaveMultiplier:1,overtimeStandardRate:1.5,overtimeWeekendRate:2,saudiGosiEmployeeRate:.0975,saudiGosiEmployerRate:.1175,nonSaudiGosiEmployerHazardRate:.02,saudiGosiMaxCap:45000,roundingDecimals:2}},
    periodMonth:'2026-09',attendanceRecords:[],activeLoans:[],penalties:[],temporaryEarnings:[],
  });
  assert.equal(item.payableDays,8);
  assert.equal(item.baseSalary,640);
  assert.equal(item.netSalary,640);
});

test('payroll screen includes archived transfers only in their final payroll month',()=>{
  const source=fs.readFileSync(new URL('../src/components/PayrollRunsView.tsx',import.meta.url),'utf8');
  assert.match(source,/archivedFinalPeriod/);
  assert.match(source,/terminationDate\?\.slice\(0,7\) === selectedPeriod/);
});

test('reviewed legacy 9999 adjustments no longer remain payroll scan findings',()=>{
  const run={id:'run-1',companyId:'c1',periodMonth:'2026-09',status:'POSTED',items:[],employeesCount:0};
  const state={employees:[],payrollRuns:[run],journals:[{id:'j1',payrollRunId:'run-1',journalType:'PAYROLL_ACCRUAL',lines:[{id:'line-balance-adjustment',accountCode:'9999',debit:10,credit:0,auditResolution:{resolvedAt:'2026-09-20T00:00:00Z'}}]}]};
  assert.equal(buildPayrollRepairPlan(state,['c1']).issues.length,0);
});
