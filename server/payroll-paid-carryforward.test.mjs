import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePaidPayrollCarryForward, reconcileReleasedPayrollCarryForward } from './payroll-paid-carryforward.mjs';

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

test('a cumulative August payment removes May through August from a later payroll', () => {
  const cumulativeSource = {
    ...sourceRun,
    items:[{
      employeeId:'employee-1',totalGrossSalary:1000,totalDeductions:0,netSalary:4000,priorPeriodNet:3000,
      priorPeriodDetails:[
        { periodMonth:'2026-05',gross:1000,deductions:0,net:1000 },
        { periodMonth:'2026-06',gross:1000,deductions:0,net:1000 },
        { periodMonth:'2026-07',gross:1000,deductions:0,net:1000 },
      ],
    }],
  };
  const septemberItem = carriedItem({
    entitlementStatus:'PAYABLE',entitlementReason:undefined,
    priorPeriodGross:4000,priorPeriodDeductions:0,priorPeriodNet:4000,
    priorPeriodDetails:[
      { periodMonth:'2026-05',gross:1000,deductions:0,net:1000 },
      { periodMonth:'2026-06',gross:1000,deductions:0,net:1000 },
      { periodMonth:'2026-07',gross:1000,deductions:0,net:1000 },
      { periodMonth:'2026-08',gross:1000,deductions:0,net:1000 },
    ],
    netSalary:5000,totalCompanyBurden:5020,
  });
  const [result] = reconcilePaidPayrollCarryForward({
    runs:[cumulativeSource,futureRun(septemberItem,{
      totalGrossSalaries:5000,totalDeductions:0,totalNetSalaries:5000,totalCompanyCost:5020,
    })],
    employees:[readyEmployee],sourceRun:cumulativeSource,paidBatch:{ employeeIds:['employee-1'] },
  });
  assert.deepEqual(result.items[0].priorPeriodDetails,[]);
  assert.equal(result.items[0].priorPeriodNet,0);
  assert.equal(result.items[0].netSalary,1000);
  assert.equal(result.totalNetSalaries,1000);
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

test('a legacy suspension hold is released by matching the saved employee suspension reason', () => {
  const legacyItem = carriedItem({ isSuspended:false,entitlementReason:'إيقاف مؤقت للموظف' });
  const [result] = reconcilePaidPayrollCarryForward({
    runs:[futureRun(legacyItem)],employees:[{ ...readyEmployee,status:'ACTIVE',suspensionReason:'إيقاف مؤقت للموظف' }],sourceRun,
    paidBatch:{ employeeIds:['employee-1'] },
  });
  assert.equal(result.items[0].entitlementStatus,'PAYABLE');
  assert.equal(result.items[0].entitlementReason,undefined);
});

test('an explicitly manual hold is never inferred as an automatic suspension hold', () => {
  const manualItem = carriedItem({ isSuspended:false,entitlementReason:'مراجعة يدوية',entitlementHoldSource:'MANUAL' });
  const [result] = reconcilePaidPayrollCarryForward({
    runs:[futureRun(manualItem)],employees:[{ ...readyEmployee,status:'ACTIVE',suspensionReason:'سبب مختلف' }],sourceRun,
    paidBatch:{ employeeIds:['employee-1'] },
  });
  assert.equal(result.items[0].entitlementStatus,'HELD');
  assert.equal(result.items[0].entitlementHoldSource,'MANUAL');
});

test('paid, reserved, and closed future payroll records are not mutated', () => {
  const reserved = futureRun(carriedItem(), { paymentBatches:[{ status:'SCHEDULED',employeeIds:['employee-1'] }] });
  const approved = futureRun(carriedItem(), { id:'approved-september',status:'APPROVED' });
  const result = reconcilePaidPayrollCarryForward({
    runs:[reserved,approved],employees:[readyEmployee],sourceRun,paidBatch:{ employeeIds:['employee-1'] },
  });
  assert.deepEqual(result,[]);
});

test('cancelling the released batch restores its salary carry exactly once', () => {
  const paidSource = {
    ...sourceRun,
    items:[{ employeeId:'employee-1',totalGrossSalary:500,totalDeductions:100,netSalary:400,priorPeriodNet:0 }],
  };
  const cleanFuture = futureRun(carriedItem({
    entitlementStatus:'PAYABLE',entitlementReason:undefined,priorPeriodGross:0,priorPeriodDeductions:0,priorPeriodNet:0,
    priorPeriodDetails:[],netSalary:1000,totalCompanyBurden:1020,
  }),{ totalGrossSalaries:1000,totalDeductions:0,totalNetSalaries:1000,totalCompanyCost:1020 });
  const [restored] = reconcileReleasedPayrollCarryForward({
    runs:[paidSource,cleanFuture],sourceRun:paidSource,releasedBatch:{ employeeIds:['employee-1'] },
  });
  assert.deepEqual(restored.items[0].priorPeriodDetails,[{ periodMonth:'2026-08',gross:500,deductions:100,net:400 }]);
  assert.equal(restored.items[0].netSalary,1400);
  assert.equal(restored.totalGrossSalaries,1500);
  assert.equal(restored.totalDeductions,100);
  assert.equal(restored.totalNetSalaries,1400);
  assert.equal(restored.totalCompanyCost,1420);
  assert.deepEqual(reconcileReleasedPayrollCarryForward({
    runs:[paidSource,restored],sourceRun:paidSource,releasedBatch:{ employeeIds:['employee-1'] },
  }),[]);
});

test('cancelling a cumulative batch restores every covered source month', () => {
  const cumulativeSource = {
    ...sourceRun,
    items:[{
      employeeId:'employee-1',totalGrossSalary:1000,totalDeductions:0,netSalary:4000,priorPeriodNet:3000,
      priorPeriodDetails:[
        { periodMonth:'2026-05',gross:1000,deductions:0,net:1000 },
        { periodMonth:'2026-06',gross:1000,deductions:0,net:1000 },
        { periodMonth:'2026-07',gross:1000,deductions:0,net:1000 },
      ],
    }],
  };
  const cleanFuture = futureRun(carriedItem({
    entitlementStatus:'PAYABLE',entitlementReason:undefined,priorPeriodGross:0,priorPeriodDeductions:0,priorPeriodNet:0,
    priorPeriodDetails:[],netSalary:1000,totalCompanyBurden:1020,
  }),{ totalGrossSalaries:1000,totalDeductions:0,totalNetSalaries:1000,totalCompanyCost:1020 });
  const [result] = reconcileReleasedPayrollCarryForward({
    runs:[cumulativeSource,cleanFuture],sourceRun:cumulativeSource,releasedBatch:{ employeeIds:['employee-1'] },
  });
  assert.deepEqual(result.items[0].priorPeriodDetails.map(detail => detail.periodMonth),['2026-05','2026-06','2026-07','2026-08']);
  assert.equal(result.items[0].priorPeriodNet,4000);
  assert.equal(result.items[0].netSalary,5000);
});

test('a released batch does not alter locked or closed later payroll', () => {
  const paidSource = { ...sourceRun,items:[{ employeeId:'employee-1',totalGrossSalary:500,totalDeductions:100,netSalary:400 }] };
  const cleanItem = carriedItem({ priorPeriodDetails:[],priorPeriodNet:0 });
  const reserved = futureRun(cleanItem,{ paymentBatches:[{ status:'PAID',employeeIds:['employee-1'] }] });
  const posted = futureRun(cleanItem,{ id:'posted-september',status:'POSTED' });
  assert.deepEqual(reconcileReleasedPayrollCarryForward({
    runs:[paidSource,reserved,posted],sourceRun:paidSource,releasedBatch:{ employeeIds:['employee-1'] },
  }),[]);
});
