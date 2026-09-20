import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const schema=fs.readFileSync(new URL('./database-schema.mjs',import.meta.url),'utf8');
const usersView=fs.readFileSync(new URL('../src/components/UserManagementView.tsx',import.meta.url),'utf8');

test('employee-linked administrative users survive the portal account split',()=>{
  assert.match(schema,/role='EMPLOYEE' AND employee_id IS NOT NULL[\s\S]*jsonb_array_length[\s\S]*> 0/);
  assert.match(schema,/SET role='OPERATIONS_MANAGER'/);
  assert.match(schema,/DELETE FROM .*users.*role='EMPLOYEE'[\s\S]*jsonb_array_length[\s\S]*= 0/);
});

test('previously deleted hybrid accounts are recovered from migration backup',()=>{
  assert.match(schema,/legacy_hybrid_users/);
  assert.match(schema,/app_state_migration_backups/);
  assert.match(schema,/JOIN .*employee_portal_accounts.*portal/);
  assert.match(schema,/portal\.id=\('portal-' \|\| \(legacy\.legacy_user->>'id'\)\)/);
  assert.match(schema,/COALESCE\(legacy_user->'permissions','\[\]'::jsonb\)/);
});

test('permission-free portal identities remain hidden from administrative users',()=>{
  assert.match(usersView,/u\.role !== 'EMPLOYEE'/);
});
