import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const hrLifecycleAlertService = fs.readFileSync('server/hr-lifecycle-alert-service.mjs', 'utf8');
const stateRoutes = fs.readFileSync('server/routes/state-routes.mjs', 'utf8').replace(/router\./g,'app.');
const stateReader = fs.readFileSync('server/normalized-state-reader.mjs', 'utf8');

function block(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + 1);
  assert.ok(start >= 0 && end > start, `${startMarker} must have a boundary`);
  return source.slice(start, end);
}

test('normal state reads are assembled without using the compatibility JSON payload', () => {
  const route = block(stateRoutes, "app.get('/state'", "app.put('/state'");
  assert.match(route, /readNormalizedApplicationState\(pool\)/);
  assert.match(route, /SELECT version,updated_at FROM/);
  assert.doesNotMatch(route, /SELECT state|rows\[0\]\.state|state:null/);
});

test('normalized application reader starts from an empty shell', () => {
  const reader = block(stateReader, 'async function readNormalizedApplicationState', 'return {');
  assert.match(reader, /hydrateNormalizedPayrollData\(client, \{\}\)/);
  assert.doesNotMatch(reader, /app_state/);
});

test('HR lifecycle processing also reads normalized tables without app_state data', () => {
  const scheduler = block(hrLifecycleAlertService, 'const run = async () => {', 'return { run };');
  assert.match(scheduler, /readNormalizedApplicationState\(pool\)/);
  assert.doesNotMatch(scheduler, /SELECT state FROM|rows\[0\]\.state/);
});
