import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['src/utils/payrollEngine.ts'],bundle:true,format:'esm',platform:'node',write:false});
const engine=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const employee={id:'e1',companyId:'c1',employeeNo:'E1',firstNameAr:'موظف',lastNameAr:'اختبار',firstNameEn:'',lastNameEn:'',nationalIdOrIqama:'1',nationality:'NON_SAUDI',country:'',email:'',phone:'',department:'D',jobTitle:'',costCenterId:'',hireDate:'2025-01-01',salaryStartDate:'2025-01-01',status:'ACTIVE',bankName:'',bankIban:'SA0000000000000000000000',salaryPackage:{baseSalary:3000,housingAllowance:900,transportAllowance:300,otherFixedAllowances:300,nonGosiOtherAllowances:0,customAllowances:[],customDeductions:[]}};
const company={id:'c1',workDaysPerMonth:30,workHoursPerDay:8,bankDefinitions:[],calculationRules:{dailyRateFormula:'BASE_ONLY',hourlyRateDivisor:8,workDaysDivisor:30,delayGracePeriodMinutes:15,delayDeductionMultiplier:1,absenceDayMultiplier:1,unpaidLeaveMultiplier:1,overtimeStandardRate:1.5,overtimeWeekendRate:2,saudiGosiEmployeeRate:.0975,saudiGosiEmployerRate:.1175,nonSaudiGosiEmployerHazardRate:.02,saudiGosiMaxCap:45000,roundingDecimals:2}};
const calculate=leaveRequests=>engine.calculateEmployeePayrollItem({employee,company,periodMonth:'2026-09',attendanceRecords:[],activeLoans:[],penalties:[],temporaryEarnings:[],leaveRequests});

test('cash leave allowance is added to monthly payroll gross and net',()=>{
  const item=calculate([{id:'l1',companyId:'c1',employeeId:'e1',type:'ANNUAL',startDate:'2026-09-01',endDate:'2026-09-10',daysCount:10,status:'APPROVED',isPaid:true,annualSettlementType:'CASH_ALLOWANCE',annualPaymentTiming:'WITH_PAYROLL',annualLeaveAmount:1500}]);
  assert.equal(item.leaveCashAllowance,1500);
  assert.equal(item.totalGrossSalary,6000);
  assert.equal(item.netSalary,6000);
});

test('advance-paid leave is recorded in payroll and not paid twice',()=>{
  const item=calculate([{id:'l2',companyId:'c1',employeeId:'e1',type:'ANNUAL',startDate:'2026-09-01',endDate:'2026-09-10',daysCount:10,status:'APPROVED',isPaid:true,annualSettlementType:'LEAVE',annualPaymentTiming:'ADVANCE',annualLeaveAmount:1500}]);
  assert.equal(item.leaveAdvancePaid,1500);
  assert.equal(item.totalGrossSalary,4500);
  assert.equal(item.totalDeductions,1500);
  assert.equal(item.netSalary,3000);
});

test('leave paid with salary keeps the normal monthly payroll unchanged',()=>{
  const item=calculate([{id:'l3',companyId:'c1',employeeId:'e1',type:'ANNUAL',startDate:'2026-09-01',endDate:'2026-09-10',daysCount:10,status:'APPROVED',isPaid:true,annualSettlementType:'LEAVE',annualPaymentTiming:'WITH_PAYROLL',annualLeaveAmount:1500}]);
  assert.equal(item.leaveCashAllowance,0);
  assert.equal(item.leaveAdvancePaid,0);
  assert.equal(item.netSalary,4500);
});

test('leave payment snapshots use actual wage divided by 30 on the server',()=>{
  const routes=fs.readFileSync(new URL('./routes/attendance-leave-routes.mjs',import.meta.url),'utf8');
  const view=fs.readFileSync(new URL('../src/components/AnnualLeaveView.tsx',import.meta.url),'utf8');
  assert.match(routes,/actualMonthlyWage\/30\*Number\(record\.daysCount\)/);
  assert.match(routes,/annualLeavePaymentSnapshot/);
  assert.match(view,/CASH_ALLOWANCE/);
  assert.match(view,/ADVANCE/);
});
