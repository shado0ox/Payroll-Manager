import assert from 'node:assert/strict';
import test from 'node:test';

import { createStateVersionService } from './state-version-service.mjs';

const workflowError = (status, code) => Object.assign(new Error(code), { status });

test('state version service bumps metadata without legacy JSON writes', async () => {
  const calls = [];
  const client = { query:async (sql,params) => {
    calls.push({ sql,params });
    return { rowCount:1,rows:[{ version:12,updated_at:'2026-09-14T00:00:00.000Z' }] };
  } };
  const service = createStateVersionService({ q:name => name,workflowError });

  const updated = await service.bumpStateVersion(client, 'user-1');

  assert.equal(updated.rows[0].version, 12);
  assert.match(calls[0].sql, /SET version=version\+1,updated_by=\$1,updated_at=now\(\)/);
  assert.doesNotMatch(calls[0].sql, /state=/);
  assert.deepEqual(calls[0].params, ['user-1']);
});

test('locked normalized reads lock the version before hydration', async () => {
  const order = [];
  const client = { query:async () => {
    order.push('lock');
    return { rowCount:1,rows:[{ version:'9' }] };
  } };
  const service = createStateVersionService({
    q:name => name,
    workflowError,
    readNormalizedApplicationState:async receivedClient => {
      assert.equal(receivedClient, client);
      order.push('read');
      return { employees:[] };
    },
  });

  assert.equal(await service.lockStateVersion(client), 9);
  order.length = 0;
  assert.deepEqual(await service.readLockedNormalizedState(client), { employees:[] });
  assert.deepEqual(order, ['lock','read']);
});

test('state version service rejects an uninitialized metadata row', async () => {
  const service = createStateVersionService({ q:name => name,workflowError });
  const client = { query:async () => ({ rowCount:0,rows:[] }) };

  await assert.rejects(service.bumpStateVersion(client, 'user-1'), error => error.status === 409 && error.message === 'STATE_NOT_INITIALIZED');
  await assert.rejects(service.lockStateVersion(client), error => error.status === 409 && error.message === 'STATE_NOT_INITIALIZED');
});
