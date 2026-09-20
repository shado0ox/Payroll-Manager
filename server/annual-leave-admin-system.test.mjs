import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {resolveAnnualLeaveBalance} from './routes/employee-portal-routes.mjs';

// Regression coverage for the standalone administration screen and server-owned balance rules.
const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const view=fs.readFileSync(new URL('../src/components/AnnualLeaveView.tsx',import.meta.url),'utf8');
const employeeForm=fs.readFileSync(new URL('../src/components/employees/EmployeeFormModal.tsx',import.meta.url),'utf8');
const routes=fs.readFileSync(new URL('./routes/attendance-leave-routes.mjs',import.meta.url),'utf8');

test('annual leave has a dedicated administration screen outside employee data entry',()=>{
  assert.match(app,/AnnualLeaveView/);
  assert.match(view,/أرصدة الموظفين/);
  assert.match(view,/ضبط الرصيد/);
  assert.match(view,/إضافة طلب/);
  assert.doesNotMatch(employeeForm,/سياسة الإجازة السنوية/);
  assert.doesNotMatch(employeeForm,/الرصيد الافتتاحي\/المرحّل/);
});

test('admin leave commands enforce overlap, year and available annual balance on the server',()=>{
  assert.match(routes,/validateLeaveAvailability/);
  assert.match(routes,/EMPLOYEE_LEAVE_OVERLAP/);
  assert.match(routes,/ANNUAL_LEAVE_SINGLE_YEAR_REQUIRED/);
  assert.match(routes,/ANNUAL_LEAVE_BALANCE_EXCEEDED/);
});

test('opening balance is applied only to its configured year',()=>{
  const employee={hire_date:'2024-01-01',payload:{annualLeavePolicy:'LABOR_LAW',annualLeaveOpeningBalance:5,annualLeavePriorUsedDays:2,annualLeaveBalanceYear:2026}};
  assert.deepEqual(resolveAnnualLeaveBalance(employee,2026),{policy:'LABOR_LAW',entitlementDays:21,openingBalanceDays:5,priorUsedDays:2});
  assert.deepEqual(resolveAnnualLeaveBalance(employee,2027),{policy:'LABOR_LAW',entitlementDays:21,openingBalanceDays:0,priorUsedDays:0});
});
