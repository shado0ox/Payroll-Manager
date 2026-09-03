import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('src/App.tsx','utf8');
const api = fs.readFileSync('src/utils/api.ts','utf8');
const server = fs.readFileSync('server/index.mjs','utf8');
const modal = fs.readFileSync('src/components/DatabaseStatusModal.tsx','utf8');
const navbar = fs.readFileSync('src/components/Navbar.tsx','utf8');

test('normal React state updates never trigger a full-state persistence effect', () => {
  assert.doesNotMatch(app,/api\.saveState/);
  assert.doesNotMatch(app,/persistFullStateToDatabase/);
  assert.doesNotMatch(app,/remoteStateSnapshotRef|persistenceEpochRef/);
  assert.doesNotMatch(api,/saveState:|buildStatePatch|MUTABLE_COLLECTIONS/);
});

test('full-state replacement requires an explicit developer restore', () => {
  const start = server.indexOf("app.put('/api/state'");
  const end = server.indexOf('async function updateCompatibilityCollectionRecord',start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start,end);
  assert.match(route,/req\.user\.id !== 'user-admin'/);
  assert.match(route,/req\.body\?\.operation !== 'RESTORE_BACKUP'/);
  assert.match(route,/replaceNormalizedPayrollData/);
  assert.match(route,/replaceNormalizedOperationsData/);
  assert.match(route,/replaceNormalizedCoreData/);
  assert.match(api,/restoreState: async/);
  assert.match(api,/operation:'RESTORE_BACKUP'/);
});

test('generic state patch is removed from both server and UI client', () => {
  assert.doesNotMatch(server,/app\.patch\('\/api\/state\/patch'/);
  assert.doesNotMatch(api,/request<[^>]*>\('\/api\/state\/patch'/);
});

test('backup UI waits for the committed restore and no longer exposes instant reset', () => {
  assert.match(modal,/onRestoreState: \(restoredState: AppState\) => Promise<boolean>/);
  assert.match(modal,/await onRestoreState\(parsed\.state\)/);
  assert.match(modal,/Authorized company data will be replaced with this backup/);
  assert.doesNotMatch(navbar,/onResetData|resetData/);
  assert.doesNotMatch(app,/handleResetData|resetToCleanState/);
});
