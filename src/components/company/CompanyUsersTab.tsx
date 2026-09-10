import React, { useMemo, useState } from 'react';
import { AlertCircle, Edit, Plus, Trash2, User, X } from 'lucide-react';
import type { Company, UserAccount, UserRole } from '../../types';
import { isStrongPassword, passwordPolicyMessage } from '../../utils/passwordPolicy';

const ROLE_INFO: Record<UserRole, { labelAr: string; labelEn: string; descAr: string; descEn: string; color: string; badgeBg: string }> = {
  ADMIN: {
    labelAr: 'مسؤول النظام (Admin)',
    labelEn: 'System Administrator',
    descAr: 'صلاحيات كاملة وغير مقيدة على جميع الشركات والعمليات والحسابات',
    descEn: 'Full unrestricted access to all companies, operations, and accounts',
    color: 'text-purple-700 border-purple-200',
    badgeBg: 'bg-purple-50 text-purple-700',
  },
  COMPANY_MANAGER: {
    labelAr: 'المدير العام للمنشأة',
    labelEn: 'General Manager',
    descAr: 'إدارة تشغيلية ومالية للمنشأة دون إضافة أو حذف الشركات، بصلاحيات قابلة للتخصيص',
    descEn: 'Operational and financial company management with customizable permissions, excluding company creation and deletion',
    color: 'text-indigo-700 border-indigo-200',
    badgeBg: 'bg-indigo-50 text-indigo-700',
  },
  OPERATIONS_MANAGER: {
    labelAr: 'مدير العمليات',
    labelEn: 'Operations Manager',
    descAr: 'إدارة الموظفين والرواتب والخصومات والإجازات والسلف وأوامر الدفع دون اعتماد الرواتب',
    descEn: 'Manage employees, payroll, deductions, leave, loans and payment orders without payroll approval',
    color: 'text-emerald-700 border-emerald-200',
    badgeBg: 'bg-emerald-50 text-emerald-700',
  },
};

interface CompanyUsersTabProps {
  company: Company;
  users: UserAccount[];
  companyUsers: UserAccount[];
  activeRole: UserRole;
  currentUser?: UserAccount | null;
  language: 'ar' | 'en';
  onSaveUser?: (user: UserAccount) => boolean | Promise<boolean>;
  onDeleteUser?: (userId: string) => boolean | Promise<boolean>;
  tr: (ar: string, en: string) => string;
}

export const CompanyUsersTab = React.memo<CompanyUsersTabProps>(({
  company,
  users,
  companyUsers,
  activeRole,
  currentUser,
  language,
  onSaveUser,
  onDeleteUser,
  tr,
}) => {
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [userFormData, setUserFormData] = useState<Partial<UserAccount>>({
    username: '',
    password: '',
    name: '',
    email: '',
    phone: '',
    role: 'OPERATIONS_MANAGER',
    isActive: true,
  });
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const assignableRoles = useMemo(
    () => Object.entries(ROLE_INFO).filter(([key]) => key !== 'ADMIN' && (activeRole === 'ADMIN' || key === 'OPERATIONS_MANAGER')),
    [activeRole],
  );

  const handleOpenAddUser = () => {
    setEditingUser(null);
    setUserFormError(null);
    setUserFormData({
      username: '',
      password: '',
      name: '',
      email: '',
      phone: '',
      role: 'OPERATIONS_MANAGER',
      isActive: true,
      companyIds: [company.id],
    });
    setIsUserModalOpen(true);
  };

  const handleOpenEditUser = (user: UserAccount) => {
    if (user.id === 'user-admin') return;
    setEditingUser(user);
    setUserFormError(null);
    setUserFormData({ ...user });
    setIsUserModalOpen(true);
  };

  const handleSaveUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);
    if (!userFormData.username?.trim() || !userFormData.name?.trim()) {
      setUserFormError(tr('يرجى إدخال اسم المستخدم والاسم الكامل', 'Enter the username and full name.'));
      return;
    }
    if ((!editingUser || userFormData.password) && !isStrongPassword(userFormData.password || '')) {
      setUserFormError(language === 'ar' ? passwordPolicyMessage : 'Password must contain at least 8 characters, including uppercase, lowercase, number, and symbol.');
      return;
    }
    const duplicate = users.find(user => user.username.toLowerCase() === userFormData.username?.trim().toLowerCase() && user.id !== editingUser?.id);
    if (duplicate) {
      setUserFormError(tr('اسم المستخدم هذا مسجل مسبقاً في النظام، يرجى اختيار اسم مستخدم آخر', 'This username already exists. Choose another username.'));
      return;
    }
    const companyIds = Array.from(new Set([...(userFormData.companyIds || []), company.id]));
    const user = editingUser ? {
      ...editingUser,
      ...userFormData,
      username: userFormData.username.trim(),
      name: userFormData.name.trim(),
      companyIds,
    } as UserAccount : {
      id: `user-${Date.now()}`,
      username: userFormData.username.trim(),
      password: userFormData.password!.trim(),
      name: userFormData.name.trim(),
      email: userFormData.email?.trim() || `${userFormData.username.trim()}@company.sa`,
      phone: userFormData.phone?.trim() || '',
      role: userFormData.role || 'OPERATIONS_MANAGER',
      avatar: userFormData.name.trim().charAt(0),
      companyIds,
      isActive: userFormData.isActive ?? true,
      createdAt: new Date().toISOString().split('T')[0],
    } as UserAccount;
    if (onSaveUser && !await onSaveUser(user)) return;
    setIsUserModalOpen(false);
  };

  return (
    <>
<div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
    <div>
      <h3 className="text-sm font-bold text-slate-900">{tr('المستخدمون المفوضون لإدارة منشأة', 'Authorized users for')} {language === 'ar' ? company.nameAr : (company.nameEn || company.nameAr)}</h3>
      <p className="text-xs text-slate-500">{tr('إضافة وتعيين مستخدمين وصلاحيات الدخول الخاصة بهذه المنشأة', 'Add users and assign access permissions for this company')}</p>
    </div>
    <button
      type="button"
      onClick={handleOpenAddUser}
      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm self-start"
    >
      <Plus className="w-4 h-4" />
      <span>{tr('إضافة مستخدم جديد للمنشأة', 'Add company user')}</span>
    </button>
  </div>

  {/* Users List */}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {companyUsers.map((u) => {
      const roleData = ROLE_INFO[u.role] || ROLE_INFO.OPERATIONS_MANAGER;
      const isCurrentUser = currentUser?.id === u.id;

      return (
        <div 
          key={u.id}
          className={`p-4 rounded-2xl border transition-all ${
            u.isActive 
              ? 'bg-white border-slate-200/80 hover:shadow-md' 
              : 'bg-slate-50 border-slate-200 opacity-70'
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 font-black flex items-center justify-center border border-emerald-200 shrink-0 text-sm">
                {u.avatar || u.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-slate-900 truncate">{u.name}</h4>
                  {isCurrentUser && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-700">{tr('أنت', 'You')}</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-mono">@{u.username}</p>
              </div>
            </div>

            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${roleData.badgeBg} ${roleData.color}`}>
              {language === 'ar' ? roleData.labelAr.split(' ')[0] : roleData.labelEn}
            </span>
          </div>

          <div className="space-y-1 text-[11px] text-slate-600 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{tr('البريد:', 'Email:')}</span>
              <span className="font-medium truncate max-w-[150px]">{u.email || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{tr('الهاتف:', 'Phone:')}</span>
              <span className="font-mono">{u.phone || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{tr('الحالة:', 'Status:')}</span>
              <span className={`font-bold ${u.isActive ? 'text-emerald-700' : 'text-slate-400'}`}>
                {u.isActive ? tr('مفعل ونشط', 'Active') : tr('معطل مؤقتاً', 'Temporarily disabled')}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="text-[10px] text-slate-400">
              {tr('الدور', 'Role')}: <span className="font-bold text-slate-700">{language === 'ar' ? roleData.labelAr.split(' (')[0] : roleData.labelEn}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleOpenEditUser(u)}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs"
                title={tr('تعديل المستخدم', 'Edit user')}
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
              {onDeleteUser && !isCurrentUser && u.id !== 'user-admin' && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(tr(`هل أنت متأكد من حذف المستخدم (${u.name})؟`, `Delete user (${u.name})?`))) {
                      onDeleteUser(u.id);
                    }
                  }}
                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg text-xs"
                  title={tr('حذف المستخدم', 'Delete user')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      );
    })}
  </div>
</div>
{isUserModalOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
    <div data-no-translate className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-scaleUp">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {editingUser ? tr('تعديل بيانات المستخدم', 'Edit User') : tr('إضافة مستخدم جديد للمنشأة', 'Add Company User')}
            </h3>
            <p className="text-xs text-slate-500">{tr('منشأة', 'Company')}: {language === 'ar' ? company.nameAr : (company.nameEn || company.nameAr)}</p>
          </div>
        </div>
        <button 
          onClick={() => setIsUserModalOpen(false)}
          className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {userFormError && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{userFormError}</span>
        </div>
      )}

      <form onSubmit={handleSaveUserSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{tr('الاسم الكامل *', 'Full name *')}</label>
            <input
              type="text"
              required
              value={userFormData.name || ''}
              onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              placeholder={tr('مثال: خالد محمد السالم', 'Example: Khalid Al Salem')}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{tr('اسم المستخدم (Username) *', 'Username *')}</label>
            <input
              type="text"
              required
              value={userFormData.username || ''}
              onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value.toLowerCase().trim() })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono"
              placeholder="khalid.salem"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {editingUser ? tr('كلمة المرور (اتركه فارغاً للإبقاء عليها)', 'Password (leave blank to keep current)') : tr('كلمة المرور *', 'Password *')}
            </label>
            <input
              type="password"
              required={!editingUser}
              value={userFormData.password || ''}
              onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{tr('الدور والصلاحية *', 'Role and permissions *')}</label>
            <select
              value={userFormData.role || 'OPERATIONS_MANAGER'}
              onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as UserRole })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold"
            >
              {assignableRoles.map(([key, info]) => (
                <option key={key} value={key}>
                  {language === 'ar' ? info.labelAr : info.labelEn}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{tr('البريد الإلكتروني', 'Email')}</label>
            <input
              type="email"
              value={userFormData.email || ''}
              onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              placeholder="user@company.sa"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{tr('رقم الهاتف', 'Phone number')}</label>
            <input
              type="text"
              value={userFormData.phone || ''}
              onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono"
              placeholder="05XXXXXXXX"
              dir="ltr"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="userActiveCheck"
            checked={userFormData.isActive ?? true}
            onChange={(e) => setUserFormData({ ...userFormData, isActive: e.target.checked })}
            className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
          />
          <label htmlFor="userActiveCheck" className="text-xs font-bold text-slate-700 cursor-pointer">
            {tr('حساب نشط ومسموح له بتسجيل الدخول', 'Active account allowed to sign in')}
          </label>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setIsUserModalOpen(false)}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
          >
            {tr('إلغاء', 'Cancel')}
          </button>
          <button
            type="submit"
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
          >
            {editingUser ? tr('حفظ التعديلات', 'Save changes') : tr('إضافة المستخدم', 'Add user')}
          </button>
        </div>
      </form>
    </div>
  </div>
)}
    </>
  );
});
