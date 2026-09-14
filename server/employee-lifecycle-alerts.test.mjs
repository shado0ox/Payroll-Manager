import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildHrLifecycleAlerts, hrRecipientHasPermission } from './hr-lifecycle-alert-service.mjs';

const server = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const alertService = fs.readFileSync(new URL('./hr-lifecycle-alert-service.mjs', import.meta.url), 'utf8');
const lifecycle = fs.readFileSync(new URL('../src/utils/employeeLifecycle.ts', import.meta.url), 'utf8');
const now = new Date('2026-09-01T12:00:00Z');

const employee = overrides => ({
  id:'emp-1',
  companyId:'company-1',
  employeeNo:'1001',
  firstNameAr:'موظف',
  lastNameAr:'اختبار',
  nationality:'NON_SAUDI',
  status:'ACTIVE',
  bankIban:'SA0000000000000000000000',
  bankAccountStatus:'ACTIVE',
  ...overrides,
});

test('employee lifecycle policy keeps the approved 30/60/90 day thresholds', () => {
  assert.match(lifecycle, /remaining <= 30/);
  assert.match(lifecycle, /remaining <= 60/);
  assert.match(lifecycle, /addCalendarDays\(employee\.entryDate, 90\)/);
  assert.match(lifecycle, /daysRemaining <= 7/);
  assert.match(lifecycle, /remaining <= 15/);
  assert.deepEqual(
    buildHrLifecycleAlerts([employee({ entryDate:'2026-07-03', iqamaIssueStatus:'PENDING' })], now)
      .map(alert => alert.type),
    ['NEW_HIRE_ENTRY_DEADLINE'],
  );
  assert.deepEqual(
    buildHrLifecycleAlerts([employee({ nationality:'SAUDI', contractEndDate:'2026-10-31' })], now)
      .map(alert => alert.type),
    ['SAUDI_CONTRACT_EXPIRY'],
  );
});

test('terminated and absconded employees are excluded from lifecycle alerts', () => {
  assert.deepEqual(buildHrLifecycleAlerts([
    employee({ status:'TERMINATED', iqamaExpiryDate:'2026-09-02' }),
    employee({ id:'emp-2', status:'ABSCONDED', iqamaExpiryDate:'2026-09-02' }),
  ], now), []);
});

test('new foreign arrivals only use the 90-day deadline before iqama is issued', () => {
  const pending = buildHrLifecycleAlerts([
    employee({ entryDate:'2026-07-03', iqamaIssueStatus:'PENDING' }),
  ], now);
  const issued = buildHrLifecycleAlerts([
    employee({ entryDate:'2026-07-03', iqamaIssueStatus:'ISSUED' }),
  ], now);
  assert.equal(pending.some(alert => alert.type === 'NEW_HIRE_ENTRY_DEADLINE'), true);
  assert.equal(issued.some(alert => alert.type === 'NEW_HIRE_ENTRY_DEADLINE'), false);
});

test('missing bank accounts remain a separate lifecycle alert', () => {
  const alerts = buildHrLifecycleAlerts([
    employee({ bankIban:'', bankAccountStatus:'PENDING' }),
  ], now);
  assert.equal(alerts.some(alert => alert.type === 'MISSING_BANK_ACCOUNT'), true);
});

test('HR lifecycle email recipients require explicit permission', () => {
  assert.equal(hrRecipientHasPermission({
    role:'COMPANY_MANAGER',
    is_active:true,
    email:'manager@example.com',
    permissions:['RECEIVE_HR_EXPIRY_EMAILS'],
  }), true);
  assert.equal(hrRecipientHasPermission({
    role:'COMPANY_MANAGER',
    is_active:true,
    email:'manager@example.com',
    permissions:[],
  }), false);
  assert.equal(hrRecipientHasPermission({
    role:'ADMIN',
    is_active:true,
    email:'admin@example.com',
    permissions:['RECEIVE_HR_EXPIRY_EMAILS'],
  }), false);
});

test('HR lifecycle delivery stays tenant-scoped and deduplicated', () => {
  assert.match(alertService, /user\.company_ids\.includes\(companyId\)/);
  assert.match(alertService, /new Set\(recipients\)/);
  assert.match(alertService, /alertEventKey/);
  assert.match(alertService, /hr_lifecycle_alert_deliveries/);
  assert.match(alertService, /SELECT event_key FROM/);
  assert.match(alertService, /alreadySent/);
  assert.match(alertService, /ON CONFLICT \(event_key\) DO NOTHING/);
});

test('scheduler prevents overlapping runs and is cleaned up on shutdown', () => {
  assert.match(alertService, /let runInProgress = false/);
  assert.match(alertService, /if \(runInProgress/);
  assert.match(server, /setInterval\(\(\) => \{ void runHrLifecycleAlerts\(\); \}, 6 \* 60 \* 60 \* 1000\)/);
  assert.match(server, /clearInterval\(hrAlertTimer\)/);
});
