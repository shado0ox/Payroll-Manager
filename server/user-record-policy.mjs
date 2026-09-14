export function createUserRecordPolicy({ can,allowedRoles,allPermissions,defaultPermissions,permissionsFor,workflowError }) {
  function prepareUserRecord(actor, input) {
    const user = input || {};
    if (!user.username || !user.name || !user.role || !Array.isArray(user.companyIds)) throw workflowError(400, 'INVALID_USER');
    if (!allowedRoles.has(user.role) || user.role === 'ADMIN') throw workflowError(400, 'INVALID_ROLE');
    if (actor.role === 'ADMIN' && user.companyIds.some(id => !actor.company_ids.includes(id))) throw workflowError(403, 'TENANT_DATA_IS_PRIVATE');
    const permissions = Array.isArray(user.permissions)
      ? [...new Set(user.permissions)].filter(value => allPermissions.has(value) && value !== 'MANAGE_COMPANIES')
      : defaultPermissions[user.role];
    if (actor.role !== 'ADMIN' && (user.role !== 'OPERATIONS_MANAGER' || user.companyIds.some(id => !actor.company_ids.includes(id)))) {
      throw workflowError(403, 'FORBIDDEN');
    }
    if (actor.role !== 'ADMIN' && permissions.some(permission => !permissionsFor(actor).includes(permission))) {
      throw workflowError(403, 'CANNOT_GRANT_UNOWNED_PERMISSION');
    }
    const normalizedEmail = String(user.email || '').trim().toLowerCase();
    return { user,permissions,normalizedEmail };
  }

  function assertExistingUserScope(existing, actor) {
    const existingCompanyIds = Array.isArray(existing?.company_ids) ? existing.company_ids : [];
    const targetOutsideScope = existingCompanyIds.some(id => !actor.company_ids.includes(id));
    if (targetOutsideScope || (actor.role !== 'ADMIN' && existing?.role !== 'OPERATIONS_MANAGER')) {
      throw workflowError(403, 'FORBIDDEN');
    }
  }

  return { prepareUserRecord,assertExistingUserScope };
}
