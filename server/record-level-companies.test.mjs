import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync('server/index.mjs','utf8');
const api = fs.readFileSync('src/utils/api.ts','utf8');
const app = fs.readFileSync('src/App.tsx','utf8');
const companyProfile = fs.readFileSync('src/components/CompanyProfileView.tsx','utf8');
const settings = fs.readFileSync('src/components/SettingsView.tsx','utf8');

test('company settings update only one company aggregate', () => {
  const start = server.indexOf("app.put('/api/companies/:id'");
  const end = server.indexOf('function validateJournalRecord',start);
  assert.ok(start >= 0 && end > start,'company update route must exist');
  const route = server.slice(start,end);
  assert.match(route,/updateCompanyAggregate\(client,record\)/);
  assert.match(route,/updateCompatibilityCollectionRecord\(client,'companies',committed/);
  assert.doesNotMatch(route,/replaceNormalized(?:Operations|Core|Payroll)Data/);
  assert.match(server,/DELETE FROM.*company_departments.*WHERE company_id=\$1/);
  assert.match(server,/DELETE FROM.*cost_centers.*WHERE company_id=\$1/);
  assert.match(server,/DELETE FROM.*company_bank_definitions.*WHERE company_id=\$1/);
});

test('company update is tenant scoped and preserves subscription ownership', () => {
  assert.match(server,/!user\.company_ids\.includes\(record\.id\)/);
  assert.match(server,/delete payload\.subscriptionStatus/);
  assert.match(server,/subscriptionStatus:subscriptionState\(row\)\.status/);
  assert.match(server,/MANAGE_COMPANY_PROFILE/);
});

test('company UI waits for the committed record without a full-state save', () => {
  assert.match(api,/saveCompany: async/);
  assert.match(api,/\/api\/companies\/\$\{encodeURIComponent\(company\.id\)\}/);
  assert.match(app,/api\.saveCompany\(company\)/);
  assert.match(app,/remoteStateSnapshotRef\.current = next/);
  assert.match(companyProfile,/const saved = await onUpdateCompany\(normalizedCompany\)/);
  assert.doesNotMatch(app.slice(app.indexOf('const handleUpdateCompany'),app.indexOf('const handleDeleteCompany')),/api\.saveState|saveCompanies/);
});

test('subscription changes do not resubmit the company profile', () => {
  assert.match(api,/updateSubscription: async/);
  assert.match(server,/record:\{[\s\S]*subscriptionStatus:subscriptionState\(row\)\.status/);
  const start = settings.indexOf('const saveSubscription');
  const end = settings.indexOf('// Form State for Company',start);
  const flow = settings.slice(start,end);
  assert.match(flow,/const result = await api\.updateSubscription/);
  assert.match(flow,/onSubscriptionUpdated\?\.\(result\.record,result\.updated_at\)/);
  assert.doesNotMatch(flow,/onUpdateCompany\(/);
});
