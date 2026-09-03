import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/utils/api.ts', import.meta.url), 'utf8');
const vite = fs.readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');

const routeBlock = (method, route, boundary) => {
  const marker = `app.${method}('${route}'`;
  const start = server.indexOf(marker);
  const end = server.indexOf(boundary,start + marker.length);
  assert.notEqual(start,-1,`Missing ${method.toUpperCase()} ${route}`);
  assert.notEqual(end,-1,`Missing boundary for ${route}`);
  return server.slice(start,end);
};

test('user upsert and delete commit one record and publish the new state version', () => {
  const save = routeBlock('put','/api/users/:id',"app.delete('/api/users/:id'");
  const remove = routeBlock('delete','/api/users/:id',"app.put('/api/integrations/qoyod/config'");
  for (const block of [save,remove]) {
    assert.match(block,/await client\.query\('BEGIN'\)/);
    assert.match(block,/SET version=version\+1/);
    assert.match(block,/appendStateAudit\(client,q/);
    assert.match(block,/await client\.query\('COMMIT'\)/);
    assert.match(block,/broadcastStateUpdate/);
    assert.match(block,/version:Number\(updated\.rows\[0\]\.version\)/);
  }
  assert.match(save,/ON CONFLICT \(id\) DO UPDATE/);
  assert.match(remove,/DELETE FROM .*users.*RETURNING id,name,company_ids/s);
});

test('user UI consumes committed records without legacy full-state helper writes', () => {
  const start = app.indexOf('const handleSaveUser');
  const end = app.indexOf('// Persist handlers',start);
  const handlers = app.slice(start,end);
  assert.match(handlers,/api\.saveUser\(user\)/);
  assert.match(handlers,/result\.record/);
  assert.match(handlers,/api\.deleteUser\(userId\)/);
  assert.match(handlers,/remoteStateSnapshotRef\.current = next/);
  assert.doesNotMatch(handlers,/saveUsers|saveAuditLogs/);
  assert.match(api,/updateSyncedCollection\('users',result\.record\)/);
  assert.match(api,/removeFromSyncedCollection\('users',id\)/);
});

test('every browser detects a new build and reload waits for pending saves', () => {
  assert.match(vite,/fileName: 'build-meta\.json'/);
  assert.match(vite,/__MASAR_BUILD_ID__/);
  assert.match(server,/app\.get\('\/api\/version'/);
  assert.match(server,/no-store, no-cache, must-revalidate/);
  assert.match(server,/connected:true,buildId/);
  assert.match(api,/source\.addEventListener\('ready'/);
  assert.match(app,/window\.setInterval\(\(\) => \{ void checkVersion\(\); \}, 30_000\)/);
  assert.match(app,/document\.addEventListener\('visibilitychange'/);
  assert.match(app,/current\.buildId !== __MASAR_BUILD_ID__/);
  assert.match(app,/persistenceQueueRef\.current\.catch\(\(\) => undefined\)\.finally\(\(\) => window\.location\.reload\(\)\)/);
  assert.match(app,/BuildUpdateBanner/);
});
