import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompanyRouter } from './routes/company-routes.mjs';
import { createUserRouter } from './routes/user-routes.mjs';
import { createEmployeePortalRouter } from './routes/employee-portal-routes.mjs';
import { createStateRouter } from './routes/state-routes.mjs';
import { createStateRuntime } from './state-runtime.mjs';
import { createDatabaseMigrator } from './database-migrator.mjs';
import { createStateAccessService } from './state-access.mjs';

const middleware = (_req, _res, next) => next();
const registeredRoutes = router => router.stack
  .filter(layer => layer.route)
  .map(layer => ({ path:layer.route.path,methods:Object.keys(layer.route.methods).sort() }));

test('company and user routers register their record-level management routes directly', () => {
  assert.deepEqual(registeredRoutes(createCompanyRouter({ auth:middleware,writeLimiter:middleware })), [
    { path:'/companies/:id',methods:['put'] },
    { path:'/companies',methods:['post'] },
    { path:'/companies/:id',methods:['delete'] },
    { path:'/admin/companies/:id/subscription',methods:['put'] },
  ]);
  assert.deepEqual(registeredRoutes(createUserRouter({ auth:middleware,writeLimiter:middleware })), [
    { path:'/users/:id',methods:['put'] },
    { path:'/users/:id',methods:['delete'] },
  ]);
});

test('state router directly owns read, event stream, and explicit restore endpoints', () => {
  assert.deepEqual(registeredRoutes(createStateRouter({ auth:middleware,writeLimiter:middleware })), [
    { path:'/state/events',methods:['get'] },
    { path:'/state',methods:['get'] },
    { path:'/state',methods:['put'] },
  ]);
});

test('employee portal router exposes only the session-derived self profile', () => {
  assert.deepEqual(registeredRoutes(createEmployeePortalRouter({ auth:middleware })), [
    { path:'/employee-portal/me',methods:['get'] },
  ]);
});

test('state runtime scopes incremental changes and disconnects only the requested user', () => {
  const writesA = [];
  const writesB = [];
  let endedA = false;
  let endedB = false;
  const runtime = createStateRuntime({ q:name => name,buildId:'test-build',workflowError:(status,code) => Object.assign(new Error(code),{ status }) });
  runtime.addStateEventClient({ userId:'a',companyIds:new Set(['company-a']),response:{ write:value => writesA.push(value),end:() => { endedA = true; } } });
  runtime.addStateEventClient({ userId:'b',companyIds:new Set(['company-b']),response:{ write:value => writesB.push(value),end:() => { endedB = true; } } });
  runtime.broadcastStateUpdate({ version:2,companyIds:['company-a'],changes:[{ type:'employee' }] });
  assert.match(writesA[0],/"changes":\[\{"type":"employee"\}\]/);
  assert.match(writesB[0],/"changes":\[\]/);
  assert.match(writesA[0],/"buildId":"test-build"/);
  runtime.disconnectStateEventClients('a');
  assert.equal(endedA,true);
  assert.equal(endedB,false);
});

test('database migrator receives the validated schema from bootstrap', () => {
  const queries = [];
  const migrate = createDatabaseMigrator({
    schema:'test_schema',
    pool:{ query:sql => { queries.push(sql); throw new Error('STOP_AFTER_SCHEMA'); } },
  });
  return assert.rejects(migrate(), error => {
    assert.equal(error.message,'STOP_AFTER_SCHEMA');
    assert.equal(queries[0],'CREATE SCHEMA IF NOT EXISTS "test_schema"');
    return true;
  });
});

test('state access uses only its injected scope and validation dependencies', () => {
  const companyScopedKeys = ['employees','payrollRuns','payrollSettlements'];
  const service = createStateAccessService({
    clone:structuredClone,
    can:() => true,
    allowedCompanyIds:user => new Set(user.company_ids),
    itemCompanyId:item => item?.companyId || '',
    companyScopedKeys,
    operationsMutableKeys:new Set(companyScopedKeys),
    asArray:value => Array.isArray(value) ? value : [],
    sameJson:(a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null),
    validateClosedPayrollInputs:() => {},
    validatePayrollWorkflowChanges:() => {},
    validatePayrollCarryForwardState:() => {},
    workflowError:(status,code) => Object.assign(new Error(code),{ status }),
  });
  const user = { id:'admin',role:'ADMIN',company_ids:['company-a'] };
  const state = { companies:[{ id:'company-a',nameAr:'أ' },{ id:'company-b',nameAr:'ب' }],employees:[{ id:'a',companyId:'company-a' },{ id:'b',companyId:'company-b' }] };
  assert.deepEqual(service.publicStateForUser(state,user).employees,[{ id:'a',companyId:'company-a' }]);
  assert.deepEqual(service.mergeStateForUser(state,state,user).employees,[state.employees[1],state.employees[0]]);
});
