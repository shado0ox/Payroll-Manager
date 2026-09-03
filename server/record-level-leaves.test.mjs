import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync('server/index.mjs','utf8');
const api = fs.readFileSync('src/utils/api.ts','utf8');
const app = fs.readFileSync('src/App.tsx','utf8');
const view = fs.readFileSync('src/components/AttendanceLeavesView.tsx','utf8');

function routeBlock(method,path,nextMarker) {
  const start = server.indexOf(`app.${method}('${path}'`);
  const end = server.indexOf(nextMarker,start + 1);
  assert.ok(start >= 0,`${method.toUpperCase()} ${path} route must exist`);
  assert.ok(end > start,`${method.toUpperCase()} ${path} route must have a boundary`);
  return server.slice(start,end);
}

test('leave request creation and editing upsert only one row', () => {
  const put = routeBlock('put','/api/leaves/:id',"app.patch('/api/leaves/:id/status'");
  assert.match(put,/INSERT INTO.*leave_requests[\s\S]*ON CONFLICT \(id\) DO UPDATE/);
  assert.match(put,/INVALID_LEAVE_EMPLOYEE/);
  assert.match(put,/LEAVE_STATUS_ENDPOINT_REQUIRED/);
  assert.doesNotMatch(put,/replaceNormalized(?:Operations|Core|Payroll)Data/);
});

test('leave decisions use a dedicated status command', () => {
  const patch = routeBlock('patch','/api/leaves/:id/status',"app.put('/api/penalties/:id'");
  assert.match(patch,/UPDATE.*leave_requests.*SET status=\$2/);
  assert.match(patch,/LEAVE_STATUS_TRANSITION/);
  assert.match(patch,/updateCompatibilityCollectionRecord\(client,'leaves'/);
  assert.doesNotMatch(patch,/replaceNormalized(?:Operations|Core|Payroll)Data/);
});

test('leave UI waits for committed records and updates its synchronized baseline', () => {
  assert.match(api,/saveLeaveRequest: async/);
  assert.match(api,/updateLeaveStatus: async/);
  assert.match(api,/\/api\/leaves\/\$\{encodeURIComponent\(id\)\}\/status/);
  assert.match(app,/api\.saveLeaveRequest\(leave\)/);
  assert.match(app,/api\.updateLeaveStatus\(leaveId,status\)/);
  assert.match(view,/leave\.status === 'REJECTED'/);
  assert.match(view,/مرفوضة/);
});
