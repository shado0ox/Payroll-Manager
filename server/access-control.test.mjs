import assert from 'node:assert/strict';
import test from 'node:test';

import { ALL_PERMISSIONS, assertCompanyAccess, can, permissionsFor } from './access-control.mjs';

test('role permissions preserve admin, defaults, and explicit overrides', () => {
  assert.deepEqual(new Set(permissionsFor({ role:'ADMIN' })), ALL_PERMISSIONS);
  assert.equal(can({ role:'COMPANY_MANAGER' }, 'MANAGE_COMPANY_PROFILE'), true);
  assert.equal(can({ role:'COMPANY_MANAGER' }, 'MANAGE_COMPANIES'), false);
  assert.equal(can({ role:'OPERATIONS_MANAGER',permissions:['VIEW_REPORTS'] }, 'VIEW_REPORTS'), true);
  assert.equal(can({ role:'OPERATIONS_MANAGER',permissions:['VIEW_REPORTS'] }, 'MANAGE_PAYROLL'), false);
  assert.deepEqual(permissionsFor({ role:'EMPLOYEE',permissions:['VIEW_REPORTS'] }), []);
  assert.equal(can({ role:'EMPLOYEE',permissions:['VIEW_REPORTS'] }, 'VIEW_REPORTS'), false);
});

test('company access stays restricted to assigned companies unless admin scope is unrestricted', () => {
  const manager = { role:'COMPANY_MANAGER',company_ids:['company-a'] };
  assert.doesNotThrow(() => assertCompanyAccess(manager, 'company-a'));
  assert.throws(() => assertCompanyAccess(manager, 'company-b'), error => error.message === 'FORBIDDEN' && error.status === 403);

  const admin = { role:'ADMIN',company_ids:['company-a'] };
  assert.doesNotThrow(() => assertCompanyAccess(admin, 'company-b'));
  assert.throws(
    () => assertCompanyAccess(admin, 'company-b', { adminMayAccessAssignedOnly:true }),
    error => error.message === 'FORBIDDEN' && error.status === 403,
  );
});
