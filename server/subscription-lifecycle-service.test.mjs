import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  createSubscriptionLifecycleService,
  scrubCompanyFromState,
  subscriptionNoticeNumber,
} from './subscription-lifecycle-service.mjs';

const source = fs.readFileSync(new URL('./subscription-lifecycle-service.mjs', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('./database-schema.mjs', import.meta.url), 'utf8');
const authorization = fs.readFileSync(new URL('./authorization-service.mjs', import.meta.url), 'utf8');
const passwordReset = fs.readFileSync(new URL('./routes/auth-password-reset-routes.mjs', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('subscription notices are limited to two calendar slots per month', () => {
  const started = '2026-09-03T00:00:00.000Z';
  assert.equal(subscriptionNoticeNumber(started, '2026-09-03T01:00:00.000Z'), subscriptionNoticeNumber(started, '2026-09-15T23:59:59.000Z'));
  assert.notEqual(subscriptionNoticeNumber(started, '2026-09-15T23:59:59.000Z'), subscriptionNoticeNumber(started, '2026-09-16T00:00:00.000Z'));
  assert.notEqual(subscriptionNoticeNumber(started, '2026-09-30T23:59:59.000Z'), subscriptionNoticeNumber(started, '2026-10-01T00:00:00.000Z'));
});

test('legacy snapshots are scrubbed of the purged company without affecting other tenants', () => {
  const scrubbed = scrubCompanyFromState({
    activeCompanyId:'company-a',
    companies:[{ id:'company-a' },{ id:'company-b' }],
    employees:[{ id:'a',companyId:'company-a' },{ id:'b',companyId:'company-b' }],
    payrollRuns:[{ id:'run-a',companyId:'company-a' }],
    qoyodConfig:{ apiKey:'secret-for-company-a' },
    users:[
      { id:'manager-a',role:'COMPANY_MANAGER',companyIds:['company-a'] },
      { id:'shared',role:'OPERATIONS_MANAGER',companyIds:['company-a','company-b'] },
    ],
    qoyodConfigsByCompany:{ 'company-a':{ enabled:true },'company-b':{ enabled:false } },
  }, 'company-a');
  assert.deepEqual(scrubbed.companies, [{ id:'company-b' }]);
  assert.deepEqual(scrubbed.employees, [{ id:'b',companyId:'company-b' }]);
  assert.deepEqual(scrubbed.payrollRuns, []);
  assert.deepEqual(scrubbed.users, [{ id:'shared',role:'OPERATIONS_MANAGER',companyIds:['company-b'] }]);
  assert.deepEqual(scrubbed.qoyodConfigsByCompany, { 'company-b':{ enabled:false } });
  assert.equal(scrubbed.qoyodConfig, undefined);
  assert.equal(scrubbed.activeCompanyId, 'company-b');
});

test('physical purge rechecks the deadline inside a transaction and removes tenant tables', async () => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (String(sql).includes('SELECT id,company_code FROM companies')) return { rowCount:1,rows:[{ id:'company-a' }] };
      if (String(sql).includes('SELECT id,role,company_ids FROM users')) return { rowCount:0,rows:[] };
      if (String(sql).startsWith('SELECT id AS snapshot_id')) return { rowCount:0,rows:[] };
      return { rowCount:1,rows:[] };
    },
    release() {},
  };
  const service = createSubscriptionLifecycleService({
    pool:{ connect:async () => client,query:async () => ({ rowCount:0,rows:[] }) },
    q:name => name,resendApiKey:'',emailFrom:'',developerContactPhone:'',logger:{ info() {},error() {} },
  });
  assert.equal(await service.purgeCompany({ id:'company-a',company_code:'101' }), true);
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-1), 'COMMIT');
  assert.match(statements.join('\n'), /deletion_scheduled_at <= now\(\)/);
  for (const table of ['gosi_invoices','payroll_settlements','payroll_runs','employees','companies']) {
    assert.match(statements.join('\n'), new RegExp('DELETE FROM ' + table));
  }
});

test('physical purge rolls back without deleting when the three-month deadline is not due', async () => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (String(sql).includes('SELECT id,company_code FROM companies')) return { rowCount:0,rows:[] };
      return { rowCount:1,rows:[] };
    },
    release() {},
  };
  const service = createSubscriptionLifecycleService({
    pool:{ connect:async () => client,query:async () => ({ rowCount:0,rows:[] }) },
    q:name => name,resendApiKey:'',emailFrom:'',developerContactPhone:'',logger:{ info() {},error() {} },
  });
  assert.equal(await service.purgeCompany({ id:'company-a',company_code:'101' }), false);
  assert.deepEqual(statements.slice(-1), ['ROLLBACK']);
  assert.doesNotMatch(statements.join('\n'), /DELETE FROM companies/);
});

test('schema, server guard, recovery and suspended export screen expose the retention lifecycle', () => {
  assert.match(schema, /subscription_suspended_at/);
  assert.match(schema, /deletion_scheduled_at/);
  assert.match(schema, /subscription_notice_deliveries/);
  assert.match(source, /now\(\)\+interval '3 months'/);
  assert.match(source, /role='COMPANY_MANAGER'/);
  assert.match(authorization, /\['GET','HEAD','OPTIONS'\]/);
  assert.match(authorization, /SUBSCRIPTION_READ_ONLY/);
  assert.doesNotMatch(passwordReset, /subscription_status/);
  assert.match(app, /SubscriptionSuspendedView/);
});
