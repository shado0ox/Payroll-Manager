import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {resolveAnnualLeaveBalance} from './routes/employee-portal-routes.mjs';

const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const view=fs.readFileSync(new URL('../src/components/AnnualLeaveView.tsx',import.meta.url),'utf8');
const employeeForm=fs.readFileSync(new URL('../src/components/employees/EmployeeFormModal.tsx',import.meta.url),'utf8');
const routes=fs.readFileSync(new URL('./routes/attendance-leave-routes.mjs',import.meta.url),'utf8');
const employeeRoutes=fs.readFileSync(new URL('./routes/employee-routes.mjs',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../src/utils/api.ts',import.meta.url),'utf8');

test('annual leave has a dedicated administration screen outside employee data entry',()=>{
  assert.match(app,/AnnualLeaveView/);
  assert.match(view,/أرصدة الموظفين/);
  assert.match(view,/ضبط الرصيد/);
  assert.match(view,/إضافة طلب/);
  assert.doesNotMatch(employeeForm,/سياسة الإجازة السنوية/);
  assert.doesNotMatch(employeeForm,/الرصيد الافتتاحي\/المرحّل/);
});

test('annual leave administration supports department totals and bulk employee settings',()=>{
  assert.match(view,/كل الأقسام/);
  assert.match(view,/departmentTotals/);
  assert.match(view,/تطبيق على المحددين/);
  assert.match(view,/toggleAllVisible/);
  assert.match(view,/applyBulkSettings/);
  assert.match(employeeRoutes,/employees\/annual-leave-settings/);
  assert.match(employeeRoutes,/BULK_ANNUAL_LEAVE_SETTINGS/);
  assert.match(api,/saveAnnualLeaveSettings/);
});

test('admin leave commands enforce overlap, benefit period and available annual balance on the server',()=>{
  assert.match(routes,/validateLeaveAvailability/);
  assert.match(routes,/EMPLOYEE_LEAVE_OVERLAP/);
  assert.match(routes,/ANNUAL_LEAVE_SINGLE_BENEFIT_PERIOD_REQUIRED/);
  assert.match(routes,/ANNUAL_LEAVE_BALANCE_EXCEEDED/);
});

test('opening balance is applied only to its configured year',()=>{
  const employee={hire_date:'2024-01-01',payload:{annualLeavePolicy:'LABOR_LAW',annualLeaveOpeningBalance:5,annualLeavePriorUsedDays:2,annualLeaveBalanceYear:2026}};
  assert.deepEqual(resolveAnnualLeaveBalance(employee,2026),{policy:'LABOR_LAW',entitlementDays:21,benefitPeriodStart:'2026-01-01',benefitPeriodEnd:'2026-12-31',nextEligibilityDate:'2027-01-01',openingBalanceDays:5,priorUsedDays:2});
  assert.deepEqual(resolveAnnualLeaveBalance(employee,2027),{policy:'LABOR_LAW',entitlementDays:21,benefitPeriodStart:'2027-01-01',benefitPeriodEnd:'2027-12-31',nextEligibilityDate:'2028-01-01',openingBalanceDays:0,priorUsedDays:0});
});

test('professional annual leave periods start on each employee work anniversary',()=>{
  const employee={hire_date:'2021-09-08',payload:{annualLeavePolicy:'LABOR_LAW'}};
  const beforeFifth=resolveAnnualLeaveBalance(employee,2026,'2026-09-07');
  assert.equal(beforeFifth.entitlementDays,21);
  assert.equal(beforeFifth.benefitPeriodStart,'2025-09-08');
  assert.equal(beforeFifth.benefitPeriodEnd,'2026-09-07');
  const afterFifth=resolveAnnualLeaveBalance(employee,2026,'2026-09-08');
  assert.equal(afterFifth.entitlementDays,30);
  assert.equal(afterFifth.benefitPeriodStart,'2026-09-08');
  assert.equal(afterFifth.benefitPeriodEnd,'2027-09-07');
});

test('domestic workers receive 30 days per completed two-year benefit cycle',()=>{
  const employee={hire_date:'2024-05-10',payload:{annualLeavePolicy:'DOMESTIC_BIENNIAL_30'}};
  const before=resolveAnnualLeaveBalance(employee,2026,'2026-05-09');
  assert.equal(before.entitlementDays,0);
  assert.equal(before.nextEligibilityDate,'2026-05-10');
  const eligible=resolveAnnualLeaveBalance(employee,2026,'2026-05-10');
  assert.equal(eligible.entitlementDays,30);
  assert.equal(eligible.benefitPeriodStart,'2026-05-10');
  assert.equal(eligible.benefitPeriodEnd,'2028-05-09');
  assert.equal(eligible.nextEligibilityDate,'2028-05-10');
});
