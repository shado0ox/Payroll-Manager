import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { serverSource as server } from './test-server-source.mjs';

const api = fs.readFileSync('src/utils/api.ts','utf8');
const app = fs.readFileSync('src/App.tsx','utf8');

test('record events are tenant scoped and do not expose company ids', () => {
  assert.match(server, /scopedCompanyIds\.some\(id => client\.companyIds\.has\(id\)\)/);
  assert.match(server, /canSeeChange \? \{ \.\.\.metadata,changes:_changes \} : \{ \.\.\.metadata,changes:\[\] \}/);
  assert.match(server, /const \{ companyIds:_companyIds,changes:_changes,\.\.\.metadata \} = payload/);
});

test('SSE authorization is refreshed after user scope changes and periodically', () => {
  assert.match(server, /userId:req\.user\.id,companyIds:new Set/);
  assert.match(server, /disconnectStateEventClients\(record\.id\)/);
  assert.match(server, /disconnectStateEventClients\(row\.id\)/);
  assert.match(server, /5 \* 60_000/);
});

test('frequent record routes publish incremental changes', () => {
  for (const collection of ['employees','attendance','leaves','loans','penalties','temporaryEarnings','payrollRuns','payrollSettlements','journals']) {
    assert.match(server,new RegExp(`collection:'${collection}'`),`${collection} must publish record changes`);
  }
  assert.match(server, /operation:'delete',ids:\[req\.params\.id\]/);
  assert.match(server, /operation:'upsert',records:\[record\]/);
});

test('browser applies contiguous record events and reloads only as fallback', () => {
  assert.match(api, /incomingVersion !== stateVersion \+ 1 \|\| !Array\.isArray\(event\.changes\)/);
  assert.match(api, /applyRecordChanges\(event\.changes\)/);
  assert.match(app, /const changes = api\.acceptStateEvent\(event\)/);
  assert.match(app, /setState\(prev => applyRemoteRecordChanges\(prev,changes\)\)/);
  assert.ok(app.indexOf('api.acceptStateEvent(event)') < app.indexOf('const remote = await api.getState()'));
  assert.doesNotMatch(app, /event\.updatedBy === currentUser\.id/);
});
