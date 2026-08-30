import assert from 'node:assert/strict';
import test from 'node:test';
import { createTenantScopedClient, scopeStateForCompanies } from './tenant-storage.mjs';

test('scopeStateForCompanies keeps only assigned tenant data and drops client audit history', () => {
  const state = scopeStateForCompanies({
    companies:[{id:'a'},{id:'b'}],
    employees:[{id:'ea',companyId:'a'},{id:'eb',companyId:'b'}],
    attendance:[{id:'aa',companyId:'a'},{id:'ab',companyId:'b'}],
    auditLogs:[{id:'log-a',companyId:'a'}],
  }, ['a']);
  assert.deepEqual(state.companies, [{id:'a'}]);
  assert.deepEqual(state.employees, [{id:'ea',companyId:'a'}]);
  assert.deepEqual(state.attendance, [{id:'aa',companyId:'a'}]);
  assert.deepEqual(state.auditLogs, []);
});

test('tenant client rewrites destructive employee delete to company-scoped SQL', async () => {
  const calls = [];
  const client = { query: async (text, params) => { calls.push([String(text), params]); return { rowCount:0, rows:[] }; } };
  const q = name => `"masar_payroll".${name}`;
  const guarded = createTenantScopedClient(client, q, ['company-a']);
  await guarded.query(`DELETE FROM ${q('employees')}`);
  assert.match(calls[0][0], /WHERE company_id=ANY\(\$1::text\[\]\)/);
  assert.deepEqual(calls[0][1], [['company-a']]);
});

test('tenant client never rewrites application audit history', async () => {
  const calls = [];
  const client = { query: async (...args) => { calls.push(args); return { rowCount:0, rows:[] }; } };
  const q = name => `"masar_payroll".${name}`;
  const guarded = createTenantScopedClient(client, q, ['company-a']);
  const result = await guarded.query(`DELETE FROM ${q('application_audit_logs')}`);
  assert.equal(result.command, 'SKIP');
  assert.equal(calls.length, 0);
});
