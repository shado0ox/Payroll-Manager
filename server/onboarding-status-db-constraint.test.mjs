import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { serverSource as source } from './test-server-source.mjs';


test('employees database constraint accepts ONBOARDING status', () => {
  assert.match(source, /CHECK \(status IN \('ONBOARDING','ACTIVE','SUSPENDED','ON_LEAVE','TERMINATED','ABSCONDED'\)\)/);
  assert.match(source, /DROP CONSTRAINT IF EXISTS employees_status_check/);
  assert.match(source, /ADD CONSTRAINT employees_status_check CHECK \(status IN \('ONBOARDING','ACTIVE','SUSPENDED','ON_LEAVE','TERMINATED','ABSCONDED'\)\)/);
});

test('direct employee save route accepts ONBOARDING status', () => {
  const start = source.indexOf("app.put('/api/employees/:id'");
  const end = source.indexOf("app.delete('/api/employees/:id'", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const route = source.slice(start, end);
  assert.match(route, /'ONBOARDING'/);
});
