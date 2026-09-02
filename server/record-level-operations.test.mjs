import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync('server/index.mjs', 'utf8');
const api = fs.readFileSync('src/utils/api.ts', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');

function routeBlock(method, path, nextMarker) {
  const start = server.indexOf(`app.${method}('${path}'`);
  const end = server.indexOf(nextMarker, start + 1);
  assert.ok(start >= 0, `${method.toUpperCase()} ${path} route must exist`);
  assert.ok(end > start, `${method.toUpperCase()} ${path} route must have a boundary`);
  return server.slice(start, end);
}

test('attendance record writes use one-row upsert and delete statements', () => {
  const put = routeBlock('put', '/api/attendance/:id', "app.delete('/api/attendance/:id'");
  const remove = routeBlock('delete', '/api/attendance/:id', "app.put('/api/penalties/:id'");
  assert.match(put, /INSERT INTO.*attendance_records[\s\S]*ON CONFLICT \(id\) DO UPDATE/);
  assert.match(remove, /DELETE FROM.*attendance_records.*WHERE id=\$1/);
  assert.doesNotMatch(put + remove, /replaceNormalized(?:Operations|Core|Payroll)Data/);
  assert.match(put + remove, /PAYROLL_SOURCE_ENTRY_LOCKED/);
});

test('penalty record writes use one-row upsert and delete statements', () => {
  const put = routeBlock('put', '/api/penalties/:id', "app.delete('/api/penalties/:id'");
  const remove = routeBlock('delete', '/api/penalties/:id', '// Record-level mutations');
  assert.match(put, /INSERT INTO.*penalties[\s\S]*ON CONFLICT \(id\) DO UPDATE/);
  assert.match(remove, /DELETE FROM.*penalties.*WHERE id=\$1/);
  assert.doesNotMatch(put + remove, /replaceNormalized(?:Operations|Core|Payroll)Data/);
  assert.match(put + remove, /PAYROLL_SOURCE_ENTRY_LOCKED/);
});

test('daily UI actions call direct record APIs instead of state patching', () => {
  for (const marker of ['saveAttendanceRecord', 'deleteAttendanceRecord', 'savePenaltyRecord', 'deletePenaltyRecord']) {
    assert.match(api, new RegExp(`${marker}: async`));
    assert.match(app, new RegExp(`api\\.${marker}\\(`));
  }
  assert.match(api, /\/api\/attendance\/\$\{encodeURIComponent\(record\.id\)\}/);
  assert.match(api, /\/api\/penalties\/\$\{encodeURIComponent\(record\.id\)\}/);
  assert.match(app, /remoteStateSnapshotRef\.current = next/);
});

test('loan writes update or delete one row and preserve append-only adjustment policy', () => {
  const put = routeBlock('put', '/api/loans/:id', "app.delete('/api/loans/:id'");
  const remove = routeBlock('delete', '/api/loans/:id', "app.put('/api/temporary-earnings/:id'");
  assert.match(put, /INSERT INTO.*loans[\s\S]*ON CONFLICT \(id\) DO UPDATE/);
  assert.match(remove, /DELETE FROM.*loans.*WHERE id=\$1/);
  assert.match(put, /isAppendOnlyLoanAdjustment/);
  assert.match(put + remove, /PAYROLL_SOURCE_ENTRY_LOCKED/);
  assert.doesNotMatch(put + remove, /replaceNormalized(?:Operations|Core|Payroll)Data/);
});

test('temporary earning writes update or delete one row', () => {
  const put = routeBlock('put', '/api/temporary-earnings/:id', "app.delete('/api/temporary-earnings/:id'");
  const remove = routeBlock('delete', '/api/temporary-earnings/:id', '// Record-level mutations');
  assert.match(put, /INSERT INTO.*temporary_earnings[\s\S]*ON CONFLICT \(id\) DO UPDATE/);
  assert.match(remove, /DELETE FROM.*temporary_earnings.*WHERE id=\$1/);
  assert.match(put + remove, /PAYROLL_SOURCE_ENTRY_LOCKED/);
  assert.doesNotMatch(put + remove, /replaceNormalized(?:Operations|Core|Payroll)Data/);
});

test('loan and temporary earning UI actions use direct committed APIs', () => {
  for (const marker of ['saveLoanRecord', 'deleteLoanRecord', 'saveTemporaryEarningRecord', 'deleteTemporaryEarningRecord']) {
    assert.match(api, new RegExp(`${marker}: async`));
    assert.match(app, new RegExp(`api\\.${marker}\\(`));
  }
  assert.match(app, /await commitLoanRecord/);
  assert.match(app, /await commitTemporaryEarningRecord/);
});
