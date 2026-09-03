import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync('server/index.mjs', 'utf8');

function block(startMarker, endMarker) {
  const start = server.indexOf(startMarker);
  const end = server.indexOf(endMarker, start + 1);
  assert.ok(start >= 0 && end > start, `${startMarker} must have a boundary`);
  return server.slice(start, end);
}

test('normal state reads are assembled without using the compatibility JSON payload', () => {
  const route = block("app.get('/api/state'", "app.put('/api/state'");
  assert.match(route, /readNormalizedApplicationState\(pool\)/);
  assert.match(route, /SELECT version,updated_at FROM/);
  assert.doesNotMatch(route, /SELECT state|rows\[0\]\.state|state:null/);
});

test('normalized application reader starts from an empty shell', () => {
  const reader = block('async function readNormalizedApplicationState', 'async function migrate');
  assert.match(reader, /hydrateNormalizedStateData\(client, \{\}\)/);
  assert.doesNotMatch(reader, /app_state/);
});

test('HR lifecycle processing also reads normalized tables without app_state data', () => {
  const scheduler = block('async function runHrLifecycleAlerts', 'async function sendVerificationEmail');
  assert.match(scheduler, /readNormalizedApplicationState\(pool\)/);
  assert.doesNotMatch(scheduler, /SELECT state FROM|rows\[0\]\.state/);
});
