import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = [
  fs.readFileSync(new URL('./database-schema.mjs',import.meta.url),'utf8'),
  fs.readFileSync(new URL('./numbered-state-migrations.mjs',import.meta.url),'utf8'),
  fs.readFileSync(new URL('./routes/employee-routes.mjs',import.meta.url),'utf8'),
].join('\n');


test('employees database constraint accepts ONBOARDING status', () => {
  assert.match(source, /CHECK \(status IN \('ONBOARDING','ACTIVE','SUSPENDED','ON_LEAVE','TERMINATED','ABSCONDED'\)\)/);
  assert.match(source, /DROP CONSTRAINT IF EXISTS employees_status_check/);
  assert.match(source, /ADD CONSTRAINT employees_status_check CHECK \(status IN \('ONBOARDING','ACTIVE','SUSPENDED','ON_LEAVE','TERMINATED','ABSCONDED'\)\)/);
});

test('direct employee save route accepts ONBOARDING status', () => {
  const start = source.indexOf("router.put('/employees/:id'");
  const end = source.indexOf("router.delete('/employees/:id'", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const route = source.slice(start, end);
  assert.match(route, /'ONBOARDING'/);
});
