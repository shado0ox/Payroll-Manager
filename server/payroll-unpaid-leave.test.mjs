import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints:['src/utils/payrollEngine.ts'],
  bundle:true,
  format:'esm',
  platform:'node',
  write:false,
});
const payrollEngine = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const company = {
  id:'company-1',
  workDaysPerMonth:30,
  workHoursPerDay:8,
  bankDefinitions:[],
  calculationRules:{
    dailyRateFormula:'BASE_ONLY',
    hourlyRateDivisor:8,
    workDaysDivisor:30,
    delayGracePeriodMinutes:15,
    delayDeductionMultiplier:1,
    absenceDayMultiplier:1,
    unpaidLeaveMultiplier:1,
    overtimeStandardRate:1.5,
    overtimeWeekendRate:2,
    saudiGosiEmployeeRate:0.0975,
    saudiGosiEmployerRate:0.1175,
    nonSaudiGosiEmployerHazardRate:0.02,
    saudiGosiMaxCap:45000,
    roundingDecimals:2,
  },
};

const employee = {
  id:'employee-1',
  employeeNo:'1',
  firstNameAr:'موظف',
  lastNameAr:'اختبار',
  firstNameEn:'Test',
  lastNameEn:'Employee',
  department:'الإدارة',
  nationality:'NON_SAUDI',
  status:'ACTIVE',
  hireDate:'2025-01-01',
  bankIban:'',
  bankName:'',
  bankSwiftCode:'',
  gosiEnabled:false,
  salaryPackage:{
    baseSalary:1300,
    housingAllowance:0,
    transportAllowance:0,
    otherFixedAllowances:0,
    nonGosiOtherAllowances:0,
    customAllowances:[],
    customDeductions:[],
  },
};

function calculate(periodMonth, records) {
  return payrollEngine.calculateEmployeePayrollItem({
    employee,
    company,
    periodMonth,
    attendanceRecords:records,
    activeLoans:[],
    penalties:[],
    temporaryEarnings:[],
  });
}

test('a full unpaid-leave month never deducts more than the monthly salary basis', () => {
  const august = calculate('2026-08', [{
    date:'2026-08-01',endDate:'2026-08-31',absence:false,unpaidLeave:true,
    delayMinutes:0,overtimeHours:0,
  }]);
  assert.equal(august.unpaidLeaveDays, 31);
  assert.equal(august.unpaidLeaveDeduction, 1300);
  assert.equal(august.netSalary, 0);

  const february = calculate('2026-02', [{
    date:'2026-02-01',endDate:'2026-02-28',absence:false,unpaidLeave:true,
    delayMinutes:0,overtimeHours:0,
  }]);
  assert.equal(february.unpaidLeaveDays, 28);
  assert.equal(february.unpaidLeaveDeduction, 1300);
  assert.equal(february.netSalary, 0);
});

test('partial unpaid leave keeps the configured 30-day calculation', () => {
  const item = calculate('2026-08', [{
    date:'2026-08-01',endDate:'2026-08-10',absence:false,unpaidLeave:true,
    delayMinutes:0,overtimeHours:0,
  }]);
  assert.equal(item.unpaidLeaveDays, 10);
  assert.equal(item.unpaidLeaveDeduction, 433.33);
  assert.equal(item.netSalary, 866.67);
});

test('overlapping unpaid-leave records do not duplicate days or deductions', () => {
  const item = calculate('2026-08', [
    { date:'2026-08-01',endDate:'2026-08-20',absence:false,unpaidLeave:true,delayMinutes:0,overtimeHours:0 },
    { date:'2026-08-15',endDate:'2026-08-31',absence:false,unpaidLeave:true,delayMinutes:0,overtimeHours:0 },
  ]);
  assert.equal(item.unpaidLeaveDays, 31);
  assert.equal(item.unpaidLeaveDeduction, 1300);
});
