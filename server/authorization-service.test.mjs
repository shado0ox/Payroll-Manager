import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuthorizationService, subscriptionState } from './authorization-service.mjs';

const response = () => ({
  statusCode:null,
  body:null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('subscription state expires trials and active subscriptions at their deadline', () => {
  const now = Date.parse('2026-09-14T00:00:00.000Z');
  assert.equal(subscriptionState({ subscription_status:'TRIAL',trial_ends_at:'2026-09-13T23:59:59.000Z' }, now).expired, true);
  assert.equal(subscriptionState({ subscription_status:'TRIAL',trial_ends_at:'2026-09-15T00:00:00.000Z' }, now).status, 'TRIAL');
  assert.equal(subscriptionState({ subscription_status:'ACTIVE',subscription_ends_at:'2026-09-14T00:00:00.000Z' }, now).expired, true);
  assert.equal(subscriptionState({ subscription_status:'SUSPENDED' }, now).status, 'SUSPENDED');
  assert.equal(subscriptionState({
    subscription_status:'SUSPENDED',
    subscription_suspended_at:'2026-09-01T00:00:00.000Z',
    deletion_scheduled_at:'2026-12-01T00:00:00.000Z',
  }, now).readOnly, true);
});

test('authorization rejects missing and expired sessions before company data access', async () => {
  const queries = [];
  const service = createAuthorizationService({
    pool:{ query:async (sql) => { queries.push(sql); return { rowCount:0,rows:[] }; } },
    q:name => name,cookieValue:() => undefined,sha256:value => `hash:${value}`,developerContactPhone:'',
  });
  const missingResponse = response();
  await service.auth({}, missingResponse, () => assert.fail('missing session must not continue'));
  assert.equal(missingResponse.statusCode, 401);
  assert.deepEqual(missingResponse.body, { error:'AUTH_REQUIRED' });
  assert.equal(queries.length, 0);

  const expiredResponse = response();
  await createAuthorizationService({
    pool:{ query:async () => ({ rowCount:0,rows:[] }) },
    q:name => name,cookieValue:() => 'token',sha256:value => `hash:${value}`,developerContactPhone:'',
  }).auth({}, expiredResponse, () => assert.fail('expired session must not continue'));
  assert.equal(expiredResponse.statusCode, 401);
  assert.deepEqual(expiredResponse.body, { error:'SESSION_EXPIRED' });
});

test('authorization refreshes valid sessions and blocks expired tenant subscriptions', async () => {
  const user = { id:'user-1',role:'COMPANY_MANAGER',company_ids:['company-a'] };
  const calls = [];
  const pool = { query:async (sql,params) => {
    calls.push({ sql,params });
    if (sql.startsWith('SELECT u.id')) return { rowCount:1,rows:[user] };
    if (sql.startsWith('UPDATE sessions')) return { rowCount:1,rows:[] };
    return { rowCount:1,rows:[{ subscription_status:'EXPIRED' }] };
  } };
  const { auth } = createAuthorizationService({
    pool,q:name => name,cookieValue:() => 'token',sha256:value => `hash:${value}`,developerContactPhone:'0500000000',
  });
  const req = { method:'POST',originalUrl:'/api/payroll-runs',path:'/api/payroll-runs' };
  const res = response();
  await auth(req, res, () => assert.fail('expired subscription must not continue'));

  assert.equal(calls[0].params[0], 'hash:token');
  assert.equal(calls[1].params[0], 'hash:token');
  assert.deepEqual(calls[2].params[0], ['company-a']);
  assert.equal(res.statusCode, 402);
  assert.equal(res.body.error, 'SUBSCRIPTION_READ_ONLY');
  assert.equal(res.body.developerContactPhone, '0500000000');
});

test('expired subscriptions may read and export data but cannot mutate it', async () => {
  const user = { id:'user-1',role:'COMPANY_MANAGER',company_ids:['company-a'] };
  const pool = { query:async sql => {
    if (sql.startsWith('SELECT u.id')) return { rowCount:1,rows:[user] };
    if (sql.startsWith('UPDATE sessions')) return { rowCount:1,rows:[] };
    return { rowCount:1,rows:[{
      subscription_status:'SUSPENDED',
      subscription_suspended_at:'2026-09-01T00:00:00.000Z',
      deletion_scheduled_at:'2026-12-01T00:00:00.000Z',
    }] };
  } };
  const { auth } = createAuthorizationService({
    pool,q:name => name,cookieValue:() => 'token',sha256:value => value,developerContactPhone:'',
  });
  let continued = false;
  await auth({ method:'GET',originalUrl:'/api/state' }, response(), () => { continued = true; });
  assert.equal(continued, true);

  const writeResponse = response();
  await auth({ method:'DELETE',originalUrl:'/api/employees/employee-1' }, writeResponse, () => assert.fail('write must stay blocked'));
  assert.equal(writeResponse.statusCode, 402);
  assert.equal(writeResponse.body.subscription.readOnly, true);
});

test('admin authorization skips tenant subscription checks', async () => {
  const calls = [];
  const pool = { query:async (sql) => {
    calls.push(sql);
    return sql.startsWith('SELECT u.id')
      ? { rowCount:1,rows:[{ id:'admin',role:'ADMIN',company_ids:[] }] }
      : { rowCount:1,rows:[] };
  } };
  const { auth } = createAuthorizationService({
    pool,q:name => name,cookieValue:() => 'token',sha256:value => value,developerContactPhone:'',
  });
  let continued = false;
  await auth({ path:'/api/admin/database' }, response(), () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(calls.length, 2);
});
