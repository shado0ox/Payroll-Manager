import { NavigationTab, UserAccount, UserPermission, UserRole } from '../types';

export const ALL_PERMISSIONS: UserPermission[] = [
  'VIEW_DASHBOARD', 'MANAGE_COMPANY_PROFILE', 'MANAGE_COMPANIES', 'MANAGE_EMPLOYEES',
  'MANAGE_ATTENDANCE', 'MANAGE_LOANS_PENALTIES', 'MANAGE_PAYROLL', 'APPROVE_PAYROLL',
  'REVERSE_PAYROLL_APPROVAL', 'POST_PAYROLL', 'CONFIRM_PAYROLL_PAYMENT', 'REVERSE_PAYROLL_PAYMENT', 'MANAGE_JOURNALS', 'VIEW_REPORTS', 'MANAGE_USERS', 'RECEIVE_HR_EXPIRY_EMAILS', 'VIEW_AUDIT_LOGS',
];

export const PERMISSION_LABELS: Record<UserPermission, { ar: string; en: string }> = {
  VIEW_DASHBOARD: { ar: 'عرض لوحة التحكم', en: 'View dashboard' },
  MANAGE_COMPANY_PROFILE: { ar: 'تعديل ملف المنشأة والبنوك', en: 'Manage company profile and banks' },
  MANAGE_COMPANIES: { ar: 'إضافة وحذف الشركات', en: 'Add and delete companies' },
  MANAGE_EMPLOYEES: { ar: 'إدارة الموظفين', en: 'Manage employees' },
  MANAGE_ATTENDANCE: { ar: 'إدارة الحضور والإجازات', en: 'Manage attendance and leave' },
  MANAGE_LOANS_PENALTIES: { ar: 'إدارة السلف والخصومات', en: 'Manage loans and deductions' },
  MANAGE_PAYROLL: { ar: 'إنشاء وتعديل المسيرات', en: 'Create and edit payroll runs' },
  APPROVE_PAYROLL: { ar: 'اعتماد مسير الرواتب', en: 'Approve payroll run' },
  REVERSE_PAYROLL_APPROVAL: { ar: 'إلغاء اعتماد وإرجاع المسير للتعديل', en: 'Reverse payroll approval / reopen run' },
  POST_PAYROLL: { ar: 'إقفال وترحيل مسير الرواتب', en: 'Close and post payroll run' },
  CONFIRM_PAYROLL_PAYMENT: { ar: 'تأكيد تنفيذ دفعات الرواتب', en: 'Confirm payroll payments' },
  REVERSE_PAYROLL_PAYMENT: { ar: 'إلغاء إثبات دفع راتب', en: 'Reverse confirmed payroll payment' },
  MANAGE_JOURNALS: { ar: 'القيود والتكامل المحاسبي', en: 'Journals and accounting integration' },
  VIEW_REPORTS: { ar: 'عرض وتصدير التقارير', en: 'View and export reports' },
  MANAGE_USERS: { ar: 'إدارة المستخدمين والصلاحيات', en: 'Manage users and permissions' },
  RECEIVE_HR_EXPIRY_EMAILS: { ar: 'استلام تنبيهات الموارد البشرية بالبريد', en: 'Receive HR expiry email notifications' },
  VIEW_AUDIT_LOGS: { ar: 'عرض سجل التدقيق', en: 'View audit log' },
};

export function defaultPermissionsForRole(role: UserRole): UserPermission[] {
  if (role === 'ADMIN') return [...ALL_PERMISSIONS];
  if (role === 'COMPANY_MANAGER') return ALL_PERMISSIONS.filter(p => p !== 'MANAGE_COMPANIES');
  return ['VIEW_DASHBOARD', 'MANAGE_EMPLOYEES', 'MANAGE_ATTENDANCE', 'MANAGE_LOANS_PENALTIES', 'MANAGE_PAYROLL', 'POST_PAYROLL', 'CONFIRM_PAYROLL_PAYMENT', 'VIEW_REPORTS'];
}

export function effectivePermissions(user?: Pick<UserAccount, 'role' | 'permissions'> | null): UserPermission[] {
  if (!user) return [];
  if (user.role === 'ADMIN') return [...ALL_PERMISSIONS];
  return Array.isArray(user.permissions) ? user.permissions : defaultPermissionsForRole(user.role);
}

export function hasPermission(user: Pick<UserAccount, 'role' | 'permissions'> | null | undefined, permission: UserPermission): boolean {
  return Boolean(user && (user.role === 'ADMIN' || effectivePermissions(user).includes(permission)));
}

/** Developer-only controls must never be granted through editable role permissions. */
export function isDeveloperAccount(user?: Pick<UserAccount, 'role' | 'username'> | null): boolean {
  return Boolean(user && user.role === 'ADMIN' && user.username.trim().toLowerCase() === 'admin');
}

export const TAB_PERMISSION: Record<NavigationTab, UserPermission> = {
  dashboard: 'VIEW_DASHBOARD', company_profile: 'MANAGE_COMPANY_PROFILE', employees: 'MANAGE_EMPLOYEES',
  payroll_runs: 'MANAGE_PAYROLL', settlements: 'MANAGE_PAYROLL', attendance: 'MANAGE_ATTENDANCE', loans_penalties: 'MANAGE_LOANS_PENALTIES',
  journals: 'MANAGE_JOURNALS', reports: 'VIEW_REPORTS', users: 'MANAGE_USERS',
  settings: 'MANAGE_COMPANIES', audit_logs: 'VIEW_AUDIT_LOGS',
};
