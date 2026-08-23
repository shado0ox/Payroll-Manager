import React, { useState } from 'react';
import { 
  UserPlus, 
  Users, 
  ShieldCheck, 
  Key, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Filter, 
  Building2, 
  Lock, 
  Mail, 
  Phone, 
  User, 
  Eye, 
  EyeOff, 
  UserCheck, 
  AlertTriangle,
  Info,
  Shield,
  Briefcase
} from 'lucide-react';
import { UserAccount, UserRole, Employee, Company } from '../types';
import { SearchableEmployeeSelect } from './SearchableEmployeeSelect';
import { isStrongPassword, passwordPolicyMessage } from '../utils/passwordPolicy';

interface UserManagementViewProps {
  users: UserAccount[];
  employees: Employee[];
  companies: Company[];
  currentUser: UserAccount | null;
  onSaveUser: (user: UserAccount) => void;
  onDeleteUser: (userId: string) => void;
}

const ROLE_INFO: Record<UserRole, { labelAr: string; descAr: string; color: string; badgeBg: string }> = {
  ADMIN: {
    labelAr: 'مسؤول النظام (Admin)',
    descAr: 'صلاحيات كاملة وغير مقيدة في إدارة النظام، المستخدمين، الشركات، والبيانات المالية',
    color: 'text-purple-700',
    badgeBg: 'bg-purple-50 border-purple-200 text-purple-700',
  },
  COMPANY_MANAGER: {
    labelAr: 'المدير العام (General Manager)',
    descAr: 'إدارة كاملة للمنشأة والمستخدمين والقيود واعتماد وترحيل مسيرات الرواتب',
    color: 'text-indigo-700',
    badgeBg: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  },
  OPERATIONS_MANAGER: {
    labelAr: 'مدير العمليات (Operations Manager)',
    descAr: 'إدارة الموظفين والحضور والإجازات والسلف والخصومات والمسيرات وأوامر الدفع دون اعتماد الرواتب',
    color: 'text-emerald-700',
    badgeBg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  },
};

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  users,
  employees,
  companies,
  currentUser,
  onSaveUser,
  onDeleteUser,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    phone: '',
    role: 'OPERATIONS_MANAGER' as UserRole,
    employeeId: '',
    companyIds: companies.map(c => c.id),
    isActive: true,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      password: '',
      name: '',
      email: '',
      phone: '',
      role: 'OPERATIONS_MANAGER',
      employeeId: '',
      companyIds: companies.map(c => c.id),
      isActive: true,
    });
    setFormError(null);
    setShowPassword(false);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (user: UserAccount) => {
    if (user.id === 'user-admin') return;
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: user.password,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      employeeId: user.employeeId || '',
      companyIds: user.companyIds.length > 0 ? user.companyIds : companies.map(c => c.id),
      isActive: user.isActive,
    });
    setFormError(null);
    setShowPassword(false);
    setIsModalOpen(true);
  };

  // Handle Employee Link Auto-fill
  const handleEmployeeSelect = (empId: string) => {
    setFormData(prev => {
      const emp = employees.find(e => e.id === empId);
      if (emp) {
        return {
          ...prev,
          employeeId: empId,
          name: prev.name || `${emp.firstNameAr} ${emp.lastNameAr}`,
          email: prev.email || emp.email,
          phone: prev.phone || emp.phone,
          username: prev.username || emp.employeeNo.toLowerCase(),
        };
      }
      return { ...prev, employeeId: empId };
    });
  };

  // Save Form
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanUsername = formData.username.trim().toLowerCase();
    if (!cleanUsername) {
      setFormError('يرجى إدخال اسم المستخدم');
      return;
    }

    if ((!editingUser || formData.password) && !isStrongPassword(formData.password)) {
      setFormError(passwordPolicyMessage);
      return;
    }

    // Check duplicate username
    const isDuplicate = users.some(
      u => u.username.toLowerCase() === cleanUsername && u.id !== editingUser?.id
    );
    if (isDuplicate) {
      setFormError('اسم المستخدم هذا مستخدم بالفعل، يرجى اختيار اسم مستخدم آخر');
      return;
    }

    const newUser: UserAccount = {
      id: editingUser ? editingUser.id : `user-${Date.now()}`,
      username: cleanUsername,
      password: formData.password,
      name: formData.name || cleanUsername,
      email: formData.email || `${cleanUsername}@masar.sa`,
      phone: formData.phone,
      role: formData.role,
      avatar: formData.name ? formData.name.charAt(0) : 'م',
      companyIds: formData.companyIds.length > 0 ? formData.companyIds : ['comp-1'],
      employeeId: formData.employeeId || undefined,
      isActive: formData.isActive,
      createdAt: editingUser ? editingUser.createdAt : new Date().toISOString(),
      lastLogin: editingUser?.lastLogin,
    };

    onSaveUser(newUser);
    setIsModalOpen(false);
  };

  // Filtered list
  const filteredUsers = users.filter((u) => {
    const matchSearch = 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
    const matchStatus = 
      statusFilter === 'ALL' || 
      (statusFilter === 'ACTIVE' && u.isActive) ||
      (statusFilter === 'INACTIVE' && !u.isActive);

    return matchSearch && matchRole && matchStatus;
  });

  const activeCount = users.filter(u => u.isActive).length;
  const adminCount = users.filter(u => u.role === 'ADMIN').length;

  return (
    <div className="space-y-6">
      
      {/* Header & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">إدارة المستخدمين والصلاحيات</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
              مسؤول النظام
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            إنشاء حسابات الموظفين والمسؤولين وتعيين الأدوار والصلاحيات وتحديد كلمات المرور
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-bold text-sm shadow-xs transition-colors cursor-pointer shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>إضافة مستخدم جديد</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">إجمالي الحسابات</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">{users.length}</h3>
          </div>
          <div className="p-3 bg-slate-100 rounded-xl text-slate-600">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">الحسابات النشطة</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">{activeCount}</h3>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">مسؤولي النظام (Admins)</p>
            <h3 className="text-2xl font-black text-purple-600 mt-1">{adminCount}</h3>
          </div>
          <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
        
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث بالاسم، اسم المستخدم، أو البريد الإلكتروني..."
            className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
          />
        </div>

        {/* Role Filter */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="تصفية حسب الدور"
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:border-emerald-500 cursor-pointer"
        >
          <option value="ALL">جميع الأدوار والصلاحيات</option>
          <option value="ADMIN">مسؤول النظام (Admin)</option>
          <option value="COMPANY_MANAGER">المدير العام</option>
          <option value="OPERATIONS_MANAGER">مدير العمليات</option>
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="تصفية حسب الحالة"
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:border-emerald-500 cursor-pointer"
        >
          <option value="ALL">جميع الحالات</option>
          <option value="ACTIVE">نشط فقط</option>
          <option value="INACTIVE">معطل فقط</option>
        </select>

      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full">
        <table className="w-full text-right text-xs table-fixed divide-y divide-slate-100">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px]">
              <th className="py-3 px-3 w-[22%] font-bold">المستخدم والاسم</th>
              <th className="py-3 px-2 w-[16%] font-bold">اسم الدخول (Username)</th>
              <th className="py-3 px-2 w-[18%] font-bold">الدور والصلاحية</th>
              <th className="py-3 px-2 w-[18%] font-bold">البريد والهاتف</th>
              <th className="py-3 px-2 w-[12%] font-bold">الموظف المرتبط</th>
              <th className="py-3 px-1.5 w-[6%] text-center font-bold">الحالة</th>
              <th className="py-3 px-2 w-[8%] text-center font-bold">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  لا يوجد مستخدمين مطابقين للبحث
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const roleMeta = ROLE_INFO[user.role] || ROLE_INFO.OPERATIONS_MANAGER;
                const linkedEmployee = employees.find(e => e.id === user.employeeId);
                const isMasterAdmin = user.id === 'user-admin';
                const isSelf = currentUser?.id === user.id;

                return (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors text-[11px]">
                    
                    {/* User & Name */}
                    <td className="py-3 px-3 truncate">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0 text-xs">
                          {user.name.charAt(0)}
                        </div>
                        <div className="min-w-0 truncate">
                          <div className="font-bold text-slate-900 truncate">
                            {user.name} {isSelf && <span className="text-[10px] text-emerald-600 font-normal">(أنت)</span>}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            أنشئ: {new Date(user.createdAt).toLocaleDateString('ar-SA')}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Username */}
                    <td className="py-3 px-2 font-mono font-bold text-slate-700 truncate" dir="ltr">
                      {user.username}
                    </td>

                    {/* Role */}
                    <td className="py-3 px-2 truncate">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${roleMeta.badgeBg}`}>
                        {roleMeta.labelAr}
                      </span>
                    </td>

                    {/* Email & Phone */}
                    <td className="py-3 px-2 truncate">
                      <div className="text-slate-800 truncate" dir="ltr">{user.email}</div>
                      {user.phone && (
                        <div className="text-[10px] text-slate-400 font-mono" dir="ltr">{user.phone}</div>
                      )}
                    </td>

                    {/* Linked Employee */}
                    <td className="py-3 px-2 truncate">
                      {linkedEmployee ? (
                        <div className="truncate">
                          <div className="font-semibold text-slate-800 truncate">
                            {linkedEmployee.firstNameAr} {linkedEmployee.lastNameAr}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {linkedEmployee.employeeNo}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[10px]">غير مرتبط</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-1.5 text-center">
                      {user.isActive ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-bold border border-emerald-200 block text-center">
                          نشط
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[9px] font-bold border border-rose-200 block text-center">
                          معطل
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-2 text-center">
                      <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                        
                        {/* Edit */}
                        {!isMasterAdmin && <button
                          onClick={() => handleOpenEdit(user)}
                          title="تعديل بيانات المستخدم وكلمة المرور"
                          className="p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>}

                        {/* Delete */}
                        {!isMasterAdmin && (
                          <button
                            onClick={() => {
                              if (isSelf) return;
                              onDeleteUser(user.id);
                            }}
                            title="حذف المستخدم"
                            className="p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                      </div>
                    </td>

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Role Matrix Guide */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-md">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-emerald-400" />
          <h3 className="font-bold text-sm text-white">دليل الأدوار والصلاحيات في النظام</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(ROLE_INFO).map(([key, info]) => (
            <div key={key} className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <div className="font-bold text-xs text-emerald-300 mb-1">{info.labelAr}</div>
              <p className="text-[11px] text-slate-300 leading-relaxed">{info.descAr}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Add / Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {editingUser ? 'تعديل بيانات المستخدم' : 'إنشاء حساب مستخدم جديد'}
                </h3>
                <p className="text-xs text-slate-500">
                  حدد بيانات الدخول والدور المطلوب والصلاحيات
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Link to existing employee (optional helper) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ربط بحساب موظف حالي (اختياري)
                </label>
                <SearchableEmployeeSelect
                  employees={employees}
                  value={formData.employeeId}
                  onChange={handleEmployeeSelect}
                  allowEmpty
                  emptyLabel="بدون ربط (حساب إداري مستقل)"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* Username */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم المستخدم للدخول <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="مثال: ahmed_hr"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-emerald-500"
                    dir="ltr"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    كلمة المرور <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="كلمة المرور"
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-emerald-500"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  الاسم الكامل <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثال: أحمد محمد علي"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    البريد الإلكتروني
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="user@example.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم الجوال
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="05XXXXXXXX"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-emerald-500"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  الدور والصلاحيات في النظام <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {currentUser?.role === 'ADMIN' && <option value="COMPANY_MANAGER">المدير العام - إدارة كاملة واعتماد الرواتب</option>}
                  <option value="OPERATIONS_MANAGER">مدير العمليات - جميع العمليات دون اعتماد الرواتب</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {ROLE_INFO[formData.role]?.descAr}
                </p>
              </div>

              {/* Status Toggle */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    حساب نشط ومفعل لتسجيل الدخول
                  </span>
                </label>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {editingUser ? 'حفظ التعديلات' : 'إنشاء المستخدم'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
