import assert from 'node:assert/strict';
import test from 'node:test';

import { createStateEventBus } from './state-event-bus.mjs';

test('state event bus scopes changes and preserves shared build metadata', () => {
  const visible = [];
  const hidden = [];
  const bus = createStateEventBus({ buildId:'build-1' });
  bus.addStateEventClient({ userId:'a',companyIds:new Set(['company-a']),response:{ write:value => visible.push(value),end() {} } });
  bus.addStateEventClient({ userId:'b',companyIds:new Set(['company-b']),response:{ write:value => hidden.push(value),end() {} } });

  bus.broadcastStateUpdate({ version:7,companyIds:['company-a'],changes:[{ type:'employee',id:'employee-1' }] });

  assert.deepEqual(JSON.parse(visible[0].slice(6)), {
    version:7,changes:[{ type:'employee',id:'employee-1' }],buildId:'build-1',
  });
  assert.deepEqual(JSON.parse(hidden[0].slice(6)), {
    version:7,changes:[],buildId:'build-1',
  });
});

test('state event bus removes disconnected and failed clients', () => {
  let ended = false;
  const bus = createStateEventBus({ buildId:'build-1' });
  bus.addStateEventClient({ userId:'user-1',companyIds:new Set(),response:{ write() {},end() { ended = true; } } });
  bus.addStateEventClient({ userId:'user-2',companyIds:new Set(),response:{ write() { throw new Error('closed'); },end() {} } });

  bus.disconnectStateEventClients('user-1');
  assert.equal(ended, true);
  assert.doesNotThrow(() => bus.broadcastStateUpdate({ version:8,changes:[] }));
});
