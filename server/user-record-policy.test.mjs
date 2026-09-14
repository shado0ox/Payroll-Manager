import assert from 'node:assert/strict';
import test from 'node:test';

import { createUserRecordPolicy } from './user-record-policy.mjs';

const workflowError = (status, code) => Object.assign(new Error(code), { status });
const policy = createUserRecordPolicy({
  can:() => true,
  allowedRoles:new Set(['ADMIN','COMPANY_MANAGER','OPERATIONS_MANAGER']),
  allPermissions:new Set(['VIEW_REPORTS','MANAGE_PAYROLL','MANAGE_COMPANIES']),
  defaultPermissions:{ OPERATIONS_MANAGER:['VIEW_REPORTS'] },
  permissionsFor:() => ['VIEW_REPORTS'],
  workflowError,
});

test('user record policy normalizes email and removes duplicate or forbidden permissions', () => {
  const result = policy.prepareUserRecord(
    { role:'ADMIN',company_ids:['company-a'] },
    { username:'worker',name:'Worker',role:'OPERATIONS_MANAGER',companyIds:['company-a'],
      email:' USER@EXAMPLE.COM ',permissions:['VIEW_REPORTS','VIEW_REPORTS','MANAGE_COMPANIES'] },
  );
  assert.equal(result.normalizedEmail, 'user@example.com');
  assert.deepEqual(result.permissions, ['VIEW_REPORTS']);
});

test('user record policy prevents cross-tenant grants and edits', () => {
  assert.throws(() => policy.prepareUserRecord(
    { role:'ADMIN',company_ids:['company-a'] },
    { username:'worker',name:'Worker',role:'OPERATIONS_MANAGER',companyIds:['company-b'] },
  ), error => error.message === 'TENANT_DATA_IS_PRIVATE');

  assert.throws(() => policy.assertExistingUserScope(
    { role:'OPERATIONS_MANAGER',company_ids:['company-b'] },
    { role:'COMPANY_MANAGER',company_ids:['company-a'] },
  ), error => error.status === 403 && error.message === 'FORBIDDEN');
});
