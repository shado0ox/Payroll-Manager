import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync('server/index.mjs','utf8');
const api = fs.readFileSync('src/utils/api.ts','utf8');
const app = fs.readFileSync('src/App.tsx','utf8');
const journalsView = fs.readFileSync('src/components/AccountingJournalsView.tsx','utf8');
const qoyodModal = fs.readFileSync('src/components/QoyodIntegrationModal.tsx','utf8');

function routeBlock(method,path,nextMarker) {
  const start = server.indexOf(`app.${method}('${path}'`);
  const end = server.indexOf(nextMarker,start + 1);
  assert.ok(start >= 0,`${method.toUpperCase()} ${path} route must exist`);
  assert.ok(end > start,`${method.toUpperCase()} ${path} route must have a boundary`);
  return server.slice(start,end);
}

test('journal writes replace only one journal aggregate', () => {
  const put = routeBlock('put','/api/journals/:id',"app.delete('/api/journals/:id'");
  const remove = routeBlock('delete','/api/journals/:id','// Record-level mutations');
  assert.match(put,/upsertJournalAggregate/);
  assert.match(put,/validateJournalRecord/);
  assert.match(remove,/DELETE FROM.*journal_batches.*WHERE id=\$1/);
  assert.match(remove,/POSTED_JOURNAL_IMMUTABLE/);
  assert.doesNotMatch(put + remove,/replaceNormalized(?:Operations|Core|Payroll)Data/);
});

test('journal aggregate upsert validates balance and replaces only its own lines', () => {
  const start = server.indexOf('async function upsertJournalAggregate');
  const end = server.indexOf("app.put('/api/attendance/:id'",start);
  const helper = server.slice(start,end);
  assert.match(helper,/ON CONFLICT \(id\) DO UPDATE/);
  assert.match(helper,/DELETE FROM.*journal_lines.*WHERE journal_batch_id=\$1/);
  assert.match(server,/UNBALANCED_JOURNAL/);
});

test('Qoyod sync commits the selected journal and updates the local server baseline', () => {
  assert.match(api,/saveJournalRecord: async/);
  assert.match(api,/\/api\/journals\/\$\{encodeURIComponent\(record\.id\)\}/);
  assert.match(app,/api\.saveJournalRecord\(journal\)/);
  assert.match(app,/remoteStateSnapshotRef\.current = next/);
  assert.match(journalsView,/onOpenQoyodModal\(activeBatch\)/);
  assert.match(qoyodModal,/await onJournalSynced\(postedJournal\)/);
  assert.match(qoyodModal,/isAlreadyPosted/);
});
