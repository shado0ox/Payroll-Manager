import assert from 'node:assert/strict';
import test from 'node:test';
import { appendStateAudit } from './state-audit.mjs';

const q = (name) => `"masar_payroll".${name}`;

test('appendStateAudit writes one server-owned event per unique company', async () => {
  const calls = [];
  const client = { query: async (text, params) => { calls.push({ text, params }); return { rowCount:1, rows:[] }; } };
  await appendStateAudit(client, q, {
    companyIds:['comp-1','comp-2','comp-1'],
    user:{ id:'user-1', username:'manager', role:'COMPANY_MANAGER' },
    action:'STATE_PATCH',
    version:42,
  });

  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.match(call.text, /INSERT INTO "masar_payroll"\.application_audit_logs/);
    assert.equal(call.params[5], 'STATE_PATCH');
    assert.equal(JSON.parse(call.params[8]).entityType, 'APP_STATE');
    assert.equal(JSON.parse(call.params[8]).entityId, 'state');
    assert.equal(JSON.parse(call.params[8]).details, 'State version 42');
  }
  assert.deepEqual(calls.map(call => call.params[1]), ['comp-1','comp-2']);
});

test('appendStateAudit ignores empty company scope and normalizes action', async () => {
  const calls = [];
  const client = { query: async (...args) => { calls.push(args); return { rowCount:1, rows:[] }; } };
  await appendStateAudit(client, q, { companyIds:[], user:{}, action:'UNTRUSTED', version:null });
  assert.equal(calls.length, 0);

  await appendStateAudit(client, q, {
    companyIds:['comp-1'], user:{ id:'user-1', role:'ADMIN' }, action:'UNTRUSTED', version:1,
  });
  assert.equal(calls[0][1][5], 'STATE_REPLACE');
});
