import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const lifecycle = fs.readFileSync(new URL('../src/utils/employeeLifecycle.ts', import.meta.url), 'utf8');

test('employee lifecycle policy keeps the approved 30/60/90 day thresholds', () => {
  assert.match(lifecycle, /remaining <= 30/);
  assert.match(lifecycle, /remaining <= 60/);
  assert.match(lifecycle, /addCalendarDays\(employee\.entryDate, 90\)/);
  assert.match(lifecycle, /remaining <= 7/);
  assert.match(lifecycle, /remaining <= 15/);
});

test('terminated and absconded employees are excluded from lifecycle alerts', () => {
  assert.match(lifecycle, /employee\.status === 'TERMINATED' \|\| employee\.status === 'ABSCONDED'/);
  assert.match(server, /employee\.status === 'TERMINATED' \|\| employee\.status === 'ABSCONDED'/);
});

test('new foreign arrivals only use the 90-day deadline before iqama is issued', () => {
  assert.match(lifecycle, /employee\.entryDate && employee\.iqamaIssueStatus !== 'ISSUED'/);
  assert.match(server, /employee\.entryDate && employee\.iqamaIssueStatus !== 'ISSUED'/);
  assert.match(server, /hrAddDays\(employee\.entryDate, 90\)/);
});

test('missing bank accounts remain a separate lifecycle alert', () => {
  assert.match(lifecycle, /type: 'MISSING_BANK_ACCOUNT'/);
  assert.match(server, /type:'MISSING_BANK_ACCOUNT'/);
  assert.match(server, /employee\.bankAccountStatus === 'PENDING'/);
});

test('HR lifecycle email recipients require explicit permission and tenant membership', () => {
  assert.match(server, /RECEIVE_HR_EXPIRY_EMAILS/);
  assert.match(server, /user\.role === 'ADMIN'/);
  assert.match(server, /Array\.isArray\(user\.company_ids\) && user\.company_ids\.includes\(companyId\)/);
  assert.match(server, /new Set\(recipients\)/);
});

test('HR lifecycle email delivery is deduplicated by a stable event key', () => {
  assert.match(server, /hrAlertEventKey/);
  assert.match(server, /hr_lifecycle_alert_deliveries/);
  assert.match(server, /SELECT event_key FROM/);
  assert.match(server, /alreadySent/);
  assert.match(server, /ON CONFLICT \(event_key\) DO NOTHING/);
});

test('scheduler prevents overlapping lifecycle email runs and cleans up on shutdown', () => {
  assert.match(server, /hrAlertRunInProgress/);
  assert.match(server, /setInterval\(\(\) => \{ void runHrLifecycleAlerts\(\); \}, 6 \* 60 \* 60 \* 1000\)/);
  assert.match(server, /clearInterval\(hrAlertTimer\)/);
});
