import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePaidPayrollCarryForward } from './payroll-paid-carryforward.mjs';

const readyEmployee = { id:'employee-1',bankIban:'SA0380000000608010167519',bankAccountStatus:'ACTIVE' };
const sourceRun = { id:'august',companyId:'company-1',periodMonth:'2026-08' };
const carriedItem = (overrides = {}) => ({
  id:'september-item',employeeId:'employee-1',entitlementStatus:'HELD',entitlementReason:'MISSING_BANK_ACCOUNT',
  priorPeriodGross:500,priorPeriodDeductions:100,priorPeriodNet:400,
  priorPeriodDetails:[{ periodMonth:'2026-08',gross:500,deductions:100,net:400 }],
  netSalary:1400,totalCompanyBurden:1420,...overrides,
});
const futureRun = (item = carriedItem(), overrides = {}) => ({
  id:'september',companyId:'company-1',periodMonth:'2026-09',status:'DRAFT',items:[item],paymentBatches:[],
  totalGrossSalaries:1500,totalDeductions:100,totalNetSalaries:1400,totalCompanyCost:1420,...overrides,
});

test('late payment removes its carry and releases an automatic bank hold', () => {
  const [result] = reconcilePaidPayrollCarryForward({
    runs:[sourceRun,futureRun()],employees:[readyEmployee],sourceRun,
    paidBatch:{ employeeIds:['employee-1'] },now:'2026-09-09T00:00:00.000Z',
  });
  assert.equal(result.items[0].priorPeriodNet,0);
  assert.deepEqual(result.items[0].priorPeriodDetails,[]);
  assert.equal(result.items[0].netSalary,1000);
  assert.equal(result.items[0].totalCompanyBurden,1020);
  assert.equal(result.items[0].entitlementStatus,'PAYABLE');
  assert.equal(result.items[0].entitlementReason,undefined);
  assert.equal(result.totalGrossSalaries,1000);
  assert.equal(result.totalDeductions,0);
  assert.equal(result.totalNetSalaries,1000);
  assert.equal(result.totalCompanyCost,1020);
});

test('manual holds are preserved while the paid carry is removed', () => {
  const [result] = reconcilePaidPayrollCarryForward({
    runs:[futureRun(carriedItem({ entitlementReason:'MANUAL_REVIEW' }))],employees:[readyEmployee],sourceRun,
    paidBatch:{ employeeIds:['employee-1'] },
  });
  assert.equal(result.items[0].entitlementStatus,'HELD');
  assert.equal(result.items[0].entitlementReason,'MANUAL_REVIEW');
  assert.equal(result.items[0].priorPeriodNet,0);
});

test('a released employee is no longer held in the later draft payroll', () => {
  const suspendedItem = carriedItem({ isSuspended:true,entitlementReason:'تعليق من ملف الموظف' });
  const [result] = reconcilePaidPayrollCarryForward({
    runs:[futureRun(suspendedItem)],employees:[{ ...readyEmployee,status:'ACTIVE' }],sourceRun,
    paidBatch:{ employeeIds:['employee-1'] },
  });
  assert.equal(result.items[0].entitlementStatus,'PAYABLE');
  assert.equal(result.items[0].isSuspended,false);
});

test('paid, reserved, and closed future payroll records are not mutated', () => {
  const reserved = futureRun(carriedItem(), { paymentBatches:[{ status:'SCHEDULED',employeeIds:['employee-1'] }] });
  const approved = futureRun(carriedItem(), { id:'approved-september',status:'APPROVED' });
  const result = reconcilePaidPayrollCarryForward({
    runs:[reserved,approved],employees:[readyEmployee],sourceRun,paidBatch:{ employeeIds:['employee-1'] },
  });
  assert.deepEqual(result,[]);
});
