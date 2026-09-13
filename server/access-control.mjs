export const ALLOWED_ROLES = new Set(['ADMIN', 'COMPANY_MANAGER', 'OPERATIONS_MANAGER']);

export const ALL_PERMISSIONS = new Set([
  'VIEW_DASHBOARD','MANAGE_COMPANY_PROFILE','MANAGE_COMPANIES','MANAGE_EMPLOYEES','MANAGE_ATTENDANCE',
  'MANAGE_LOANS_PENALTIES','MANAGE_PAYROLL','MANAGE_GOSI','APPROVE_PAYROLL','REVERSE_PAYROLL_APPROVAL',
  'POST_PAYROLL','CONFIRM_PAYROLL_PAYMENT','REVERSE_PAYROLL_PAYMENT','MANAGE_JOURNALS','VIEW_REPORTS',
  'MANAGE_USERS','RECEIVE_HR_EXPIRY_EMAILS','VIEW_AUDIT_LOGS',
]);

export const DEFAULT_PERMISSIONS = {
  COMPANY_MANAGER: [...ALL_PERMISSIONS].filter(value => value !== 'MANAGE_COMPANIES'),
  OPERATIONS_MANAGER: ['VIEW_DASHBOARD','MANAGE_EMPLOYEES','MANAGE_ATTENDANCE','MANAGE_LOANS_PENALTIES','MANAGE_PAYROLL','MANAGE_GOSI','POST_PAYROLL','CONFIRM_PAYROLL_PAYMENT','VIEW_REPORTS'],
};

export const permissionsFor = user => user.role === 'ADMIN'
  ? [...ALL_PERMISSIONS]
  : (Array.isArray(user.permissions) ? user.permissions : DEFAULT_PERMISSIONS[user.role] || []);

export const can = (user, permission) => user.role === 'ADMIN' || permissionsFor(user).includes(permission);
export const allowedCompanyIds = user => new Set(user.role === 'ADMIN' ? [] : (Array.isArray(user.company_ids) ? user.company_ids : []));
export const itemCompanyId = item => item && typeof item.companyId === 'string' ? item.companyId : '';
export const isDeveloperUser = user => user?.role === 'ADMIN' && String(user?.username || '').trim().toLowerCase() === 'admin';

export function assertCompanyAccess(user, companyId, { adminMayAccessAssignedOnly = false } = {}) {
  const assigned = Array.isArray(user?.company_ids) ? user.company_ids : [];
  if (user?.role === 'ADMIN' && !adminMayAccessAssignedOnly) return;
  if (!assigned.includes(companyId)) throw Object.assign(new Error('FORBIDDEN'), { status:403 });
}
