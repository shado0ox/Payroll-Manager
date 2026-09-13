import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const runtime = fs.readFileSync(new URL('./state-runtime.mjs', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('./database-migrator.mjs', import.meta.url), 'utf8');
const stateRoutes = fs.readFileSync(new URL('./routes/state-routes.mjs', import.meta.url), 'utf8');
const routeSources = fs.readdirSync(new URL('./routes', import.meta.url))
  .filter(name => name.endsWith('-routes.mjs'))
  .map(name => fs.readFileSync(new URL(`./routes/${name}`, import.meta.url), 'utf8'))
  .join('\n');
const server = [runtime,migration,stateRoutes,routeSources].join('\n');


test('committed record writes bump metadata without rewriting legacy state JSON', () => {
  const start = runtime.indexOf('async function bumpStateVersion');
  const end = runtime.indexOf('async function lockStateVersion', start);
  assert.ok(start >= 0 && end > start, 'state version helper must have a boundary');
  const helper = runtime.slice(start, end);
  assert.match(helper, /SET version=version\+1,updated_by=\$1,updated_at=now\(\)/);
  assert.match(helper, /RETURNING version,updated_at/);
  assert.doesNotMatch(helper, /SELECT state|SET state|JSON\.stringify|clone\(/);
});

test('legacy collection and object mirroring helpers are removed', () => {
  assert.doesNotMatch(server, /updateCompatibilityCollectionRecord|updateCompatibilityCollectionRecords/);
  assert.doesNotMatch(server, /deleteCompatibilityCollectionRecord|updateCompatibilityObject/);
  assert.doesNotMatch(server, /commitSettlementCompatibility|upsertCompatibilityItem/);
});

test('record and workflow commits still publish a new browser-visible version', () => {
  const calls = server.match(/await bumpStateVersion\(client,(?:req\.user|user)\.id\)/g) || [];
  assert.ok(calls.length >= 15, 'dedicated write routes must bump the shared version');
  assert.match(server, /broadcastStateUpdate\(\{ version:updated\.rows\[0\]\.version/);
});

test('runtime record routes never read or write the legacy JSON payload', () => {
  const runtimeRoutes = [runtime,routeSources].join('\n');
  assert.match(runtimeRoutes, /SELECT version FROM .*app_state.*FOR UPDATE/);
  assert.match(runtimeRoutes, /readLockedNormalizedState\(client\)/);
  assert.doesNotMatch(runtimeRoutes, /SELECT state FROM .*app_state|SET state=/);
});

test('startup retires legacy JSON after migrations and keeps a redacted restore snapshot table', () => {
  assert.match(migration, /app_state_restore_snapshots/);
  assert.match(migration, /ALTER TABLE .*app_state.* DROP COLUMN IF EXISTS state/);
  assert.ok(
    migration.indexOf("version='005_normalized_settlements'") < migration.indexOf('DROP COLUMN IF EXISTS state'),
    'legacy migrations must finish before the source JSON column is removed',
  );
  assert.match(stateRoutes, /apiKey:'',apiKeyConfigured:Boolean\(config\?\.apiKey\)/);
});
