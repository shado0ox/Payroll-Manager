import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync('server/index.mjs','utf8');
const api = fs.readFileSync('src/utils/api.ts','utf8');
const app = fs.readFileSync('src/App.tsx','utf8');
const profile = fs.readFileSync('src/components/CompanyProfileView.tsx','utf8');
const modal = fs.readFileSync('src/components/QoyodIntegrationModal.tsx','utf8');

function configRoute() {
  const start = server.indexOf("app.put('/api/integrations/qoyod/config'");
  const end = server.indexOf("app.post('/api/integrations/qoyod/journal'",start);
  assert.ok(start >= 0 && end > start,'Qoyod config route must exist');
  return server.slice(start,end);
}

test('Qoyod settings use a tenant-scoped record endpoint', () => {
  const route = configRoute();
  assert.match(route,/MANAGE_JOURNALS/);
  assert.match(route,/validateQoyodConfig\(companyId,req\.body\?\.config,req\.user\)/);
  assert.match(server,/!user\.company_ids\.includes\(companyId\)/);
  assert.match(route,/INSERT INTO.*integration_configs/);
  assert.doesNotMatch(route,/replaceNormalized(?:Operations|Core|Payroll)Data/);
});

test('Qoyod secret is preserved when the redacted client saves again', () => {
  const route = configRoute();
  assert.match(route,/CASE WHEN EXCLUDED\.secret_value <> '' THEN EXCLUDED\.secret_value ELSE .*integration_configs.*\.secret_value END/);
  assert.match(route,/const record = \{ .*apiKey:'',apiKeyConfigured:/);
  assert.match(route,/updateCompatibilityObject\(client,'qoyodConfig',record/);
  assert.doesNotMatch(route,/res\.json\([^\n]*secret_value/);
});

test('Qoyod UI waits for the committed redacted config', () => {
  assert.match(api,/saveQoyodConfig: async/);
  assert.match(api,/\/api\/integrations\/qoyod\/config/);
  assert.match(app,/api\.saveQoyodConfig\(activeCompany\.id,config\)/);
  assert.match(app,/qoyodConfig:result\.record/);
  assert.match(profile,/const saved = await onSaveQoyodConfig\(qConfig\)/);
  assert.match(modal,/const saved = await onSaveConfig\(config\)/);
  const handler = app.slice(app.indexOf('const handleSaveQoyodConfig'),app.indexOf('const handleResetData'));
  assert.doesNotMatch(handler,/api\.saveState|saveQoyodConfig\(config\);/);
});
