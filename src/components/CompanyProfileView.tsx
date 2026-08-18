import React, { useState, useRef, useMemo } from 'react';
import { 
  Building2, 
  Users, 
  Layers, 
  FolderTree, 
  CreditCard, 
  Sliders, 
  Save, 
  Plus, 
  Trash2, 
  Edit, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Upload, 
  Image as ImageIcon, 
  ShieldCheck, 
  KeyRound, 
  Mail, 
  Phone, 
  User, 
  Briefcase, 
  RotateCcw,
  Check,
  X,
  Lock,
  ArrowRightLeft,
  Settings2,
  Calendar,
  DollarSign,
  Key,
  Globe,
  Terminal,
  Code,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Send,
  FileSpreadsheet,
  Receipt
} from 'lucide-react';
import { 
  Company, 
  Employee, 
  UserAccount, 
  UserRole, 
  CostCenter, 
  DepartmentInfo,
  QoyodApiConfig,
  JournalBatch
} from '../types';
import { 
  validateSaudiIBAN, 
  validateSwiftCode, 
  detectBankFromIBAN, 
  getSwiftCodeFromBankName, 
  validateSaudiCR,
  validateSaudiTaxNumber,
  SAUDI_BANKS 
} from '../utils/security';
import { buildQoyodJournalPayload, generateQoyodCurlCommand, sendJournalEntryToQoyod } from '../utils/qoyodApi';
import { exportQoyodJournalCsv } from '../utils/exportUtils';
import { generatePayrollJournalBatch } from '../utils/accountingEngine';

interface CompanyProfileViewProps {
  company: Company;
  allCompanies: Company[];
  employees: Employee[];
  users: UserAccount[];
  activeRole: UserRole;
  currentUser?: UserAccount | null;
  qoyodConfig?: QoyodApiConfig;
  onSaveQoyodConfig?: (config: QoyodApiConfig) => void;
  onOpenQoyodModal?: () => void;
  onUpdateCompany: (company: Company) => void;
  onSelectCompany?: (companyId: string) => void;
  onSaveUser?: (user: UserAccount) => void;
  onDeleteUser?: (userId: string) => void;
}

type ProfileSubTab = 'details' | 'banking' | 'qoyod' | 'users' | 'departments' | 'cost_centers' | 'policies' | 'accounts';

const ROLE_INFO: Record<UserRole, { labelAr: string; descAr: string; color: string; badgeBg: string }> = {
  ADMIN: { 
    labelAr: 'مسؤول النظام (Admin)', 
    descAr: 'صلاحيات كاملة وغير مقيدة على جميع الشركات والعمليات والحسابات',
    color: 'text-purple-700 border-purple-200',
    badgeBg: 'bg-purple-50 text-purple-700'
  },
  HR_MANAGER: { 
    labelAr: 'مدير الموارد البشرية (HR Manager)', 
    descAr: 'إدارة شؤون الموظفين، الحضور، الإجازات، والجزاءات',
    color: 'text-blue-700 border-blue-200',
    badgeBg: 'bg-blue-50 text-blue-700'
  },
  PAYROLL_SPECIALIST: { 
    labelAr: 'أخصائي الرواتب (Payroll Specialist)', 
    descAr: 'حساب المسيرات، معالجة السلف، وتصدير قيود الرواتب والـ WPS',
    color: 'text-emerald-700 border-emerald-200',
    badgeBg: 'bg-emerald-50 text-emerald-700'
  },
  AUDITOR: { 
    labelAr: 'مراجع ومدقق (Auditor)', 
    descAr: 'صلاحيات القراءة والاطلاع والتدقيق والتقارير وسجلات الأمان',
    color: 'text-amber-700 border-amber-200',
    badgeBg: 'bg-amber-50 text-amber-700'
  },
  COMPANY_MANAGER: { 
    labelAr: 'المدير التنفيذي للمنشأة (Company Manager)', 
    descAr: 'صلاحيات الإشراف والاعتماد لمسيرات منشأته الخاصة',
    color: 'text-indigo-700 border-indigo-200',
    badgeBg: 'bg-indigo-50 text-indigo-700'
  },
  EMPLOYEE: { 
    labelAr: 'موظف (Employee)', 
    descAr: 'الاطلاع على قسائم الراتب الشخصية وتقديم طلبات الإجازة والسلف',
    color: 'text-slate-700 border-slate-200',
    badgeBg: 'bg-slate-100 text-slate-700'
  },
};

export const CompanyProfileView: React.FC<CompanyProfileViewProps> = ({
  company,
  allCompanies,
  employees,
  users,
  activeRole,
  currentUser,
  qoyodConfig,
  onSaveQoyodConfig,
  onOpenQoyodModal,
  onUpdateCompany,
  onSelectCompany,
  onSaveUser,
  onDeleteUser,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<ProfileSubTab>('details');
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Local editable company state
  const [formData, setFormData] = useState<Company>(() => JSON.parse(JSON.stringify(company)));
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local Qoyod config state
  const [qConfig, setQConfig] = useState<QoyodApiConfig>(() => qoyodConfig || {
    apiKey: '',
    baseUrl: 'https://api.qoyod.com/2.0',
    organizationId: '',
    autoSyncOnApprove: false,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingQoyod, setIsTestingQoyod] = useState(false);
  const [qoyodTestResult, setQoyodTestResult] = useState<{ status: 'SUCCESS' | 'FAILED'; message: string } | null>(null);
  const [isSyncingQoyod, setIsSyncingQoyod] = useState(false);
  const [qoyodSyncSuccess, setQoyodSyncSuccess] = useState<string | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [qoyodViewMode, setQoyodViewMode] = useState<'config' | 'payload' | 'curl'>('config');

  // Sync state if active company changes from outside
  React.useEffect(() => {
    if (company) {
      setFormData(JSON.parse(JSON.stringify(company)));
    }
  }, [company]);

  React.useEffect(() => {
    if (qoyodConfig) {
      setQConfig(qoyodConfig);
    }
  }, [qoyodConfig]);

  // Current company employees & users
  const companyEmployees = useMemo(() => {
    return employees.filter(e => e.companyId === formData.id);
  }, [employees, formData.id]);

  const companyUsers = useMemo(() => {
    return users.filter(u => u.companyIds.includes(formData.id) || u.role === 'ADMIN');
  }, [users, formData.id]);

  // Departments list (merging explicit departments with employee departments)
  const departmentsList: DepartmentInfo[] = useMemo(() => {
    const existing = formData.departments || [];
    const empDepts = Array.from(new Set(companyEmployees.map(e => e.department).filter(Boolean)));
    
    // Add any employee department that isn't yet explicitly created
    const merged = [...existing];
    empDepts.forEach((deptName, idx) => {
      if (!merged.some(d => d.nameAr === deptName)) {
        merged.push({
          id: `dept-auto-${idx}`,
          code: `DEP-${String(idx + 1).padStart(2, '0')}`,
          nameAr: deptName,
          nameEn: '',
          description: 'قسم إداري معتمد للموظفين'
        });
      }
    });
    return merged;
  }, [formData.departments, companyEmployees]);

  // Modals state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [userFormData, setUserFormData] = useState<Partial<UserAccount>>({
    username: '',
    password: '',
    name: '',
    email: '',
    phone: '',
    role: 'PAYROLL_SPECIALIST',
    isActive: true,
  });
  const [userFormError, setUserFormError] = useState<string | null>(null);

  // Department Modal State
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentInfo | null>(null);
  const [deptFormData, setDeptFormData] = useState<Partial<DepartmentInfo>>({
    code: '',
    nameAr: '',
    nameEn: '',
    headName: '',
    description: '',
  });

  // Cost Center Modal State
  const [isCostCenterModalOpen, setIsCostCenterModalOpen] = useState(false);
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null);
  const [costCenterFormData, setCostCenterFormData] = useState<Partial<CostCenter>>({
    code: '',
    nameAr: '',
    nameEn: '',
  });

  // Handle Save All Company Info
  const handleSaveCompany = (customData?: Company, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const dataToSave = customData || formData;
    if (!dataToSave.nameAr?.trim()) {
      alert('يرجى إدخال اسم المنشأة بالعربية');
      return;
    }
    if (!dataToSave.crNumber?.trim()) {
      alert('يرجى إدخال رقم السجل التجاري');
      return;
    }

    onUpdateCompany(dataToSave);
    setSaveSuccessMessage('تم تطبيق وحفظ كافة الإعدادات والسياسات للمنشأة بنجاح');
    setTimeout(() => {
      setSaveSuccessMessage(null);
    }, 4000);
  };

  // Logo file upload handler
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('حجم الصورة كبير جداً، الحد الأقصى المسموح به هو 2 ميجابايت.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, logo: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // User Actions
  const handleOpenAddUser = () => {
    setEditingUser(null);
    setUserFormError(null);
    setUserFormData({
      username: '',
      password: '',
      name: '',
      email: '',
      phone: '',
      role: 'PAYROLL_SPECIALIST',
      isActive: true,
      companyIds: [formData.id],
    });
    setIsUserModalOpen(true);
  };

  const handleOpenEditUser = (user: UserAccount) => {
    setEditingUser(user);
    setUserFormError(null);
    setUserFormData({ ...user });
    setIsUserModalOpen(true);
  };

  const handleSaveUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);

    if (!userFormData.username?.trim() || !userFormData.name?.trim()) {
      setUserFormError('يرجى إدخال اسم المستخدم والاسم الكامل');
      return;
    }

    if (!editingUser && !userFormData.password?.trim()) {
      setUserFormError('يرجى إدخال كلمة المرور للمستخدم الجديد');
      return;
    }

    // Check duplicate username
    const duplicate = users.find(u => u.username.toLowerCase() === userFormData.username?.trim().toLowerCase() && u.id !== editingUser?.id);
    if (duplicate) {
      setUserFormError('اسم المستخدم هذا مسجل مسبقاً في النظام، يرجى اختيار اسم مستخدم آخر');
      return;
    }

    const currentCompanyIds = userFormData.companyIds || [];
    const updatedCompanyIds = Array.from(new Set([...currentCompanyIds, formData.id]));

    if (editingUser) {
      const updatedUser: UserAccount = {
        ...editingUser,
        ...userFormData,
        username: userFormData.username!.trim(),
        name: userFormData.name!.trim(),
        companyIds: updatedCompanyIds,
      } as UserAccount;

      if (onSaveUser) onSaveUser(updatedUser);
    } else {
      const newUser: UserAccount = {
        id: `user-${Date.now()}`,
        username: userFormData.username!.trim(),
        password: userFormData.password!.trim(),
        name: userFormData.name!.trim(),
        email: userFormData.email?.trim() || `${userFormData.username!.trim()}@company.sa`,
        phone: userFormData.phone?.trim() || '',
        role: userFormData.role || 'PAYROLL_SPECIALIST',
        avatar: userFormData.name!.trim().charAt(0),
        companyIds: updatedCompanyIds,
        isActive: userFormData.isActive ?? true,
        createdAt: new Date().toISOString().split('T')[0],
      };

      if (onSaveUser) onSaveUser(newUser);
    }

    setIsUserModalOpen(false);
  };

  // Department Actions
  const handleOpenAddDept = () => {
    setEditingDept(null);
    setDeptFormData({
      code: `DEP-${String(departmentsList.length + 1).padStart(2, '0')}`,
      nameAr: '',
      nameEn: '',
      headName: '',
      description: '',
    });
    setIsDeptModalOpen(true);
  };

  const handleOpenEditDept = (dept: DepartmentInfo) => {
    setEditingDept(dept);
    setDeptFormData({ ...dept });
    setIsDeptModalOpen(true);
  };

  const handleSaveDeptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptFormData.nameAr?.trim()) {
      alert('يرجى إدخال اسم القسم بالعربية');
      return;
    }

    let updatedDepts: DepartmentInfo[];
    if (editingDept) {
      updatedDepts = departmentsList.map(d => 
        d.id === editingDept.id ? ({ ...d, ...deptFormData } as DepartmentInfo) : d
      );
    } else {
      const newDept: DepartmentInfo = {
        id: `dept-${Date.now()}`,
        code: deptFormData.code?.trim() || `DEP-${String(departmentsList.length + 1).padStart(2, '0')}`,
        nameAr: deptFormData.nameAr!.trim(),
        nameEn: deptFormData.nameEn?.trim() || '',
        headName: deptFormData.headName?.trim() || '',
        description: deptFormData.description?.trim() || '',
      };
      updatedDepts = [...departmentsList, newDept];
    }

    const updatedComp = {
      ...formData,
      departments: updatedDepts
    };
    setFormData(updatedComp);
    onUpdateCompany(updatedComp);
    setIsDeptModalOpen(false);
  };

  const handleDeleteDept = (dept: DepartmentInfo) => {
    const assignedCount = companyEmployees.filter(e => e.department === dept.nameAr).length;
    if (assignedCount > 0) {
      if (!confirm(`يوجد ${assignedCount} موظفاً مرتبطين بهذا القسم (${dept.nameAr}). هل أنت متأكد من حذف القسم من ملف المنشأة؟`)) {
        return;
      }
    } else {
      if (!confirm(`هل أنت متأكد من حذف القسم (${dept.nameAr})؟`)) return;
    }

    const updatedDepts = departmentsList.filter(d => d.id !== dept.id);
    const updatedComp = {
      ...formData,
      departments: updatedDepts
    };
    setFormData(updatedComp);
    onUpdateCompany(updatedComp);
  };

  // Cost Center Actions
  const handleOpenAddCostCenter = () => {
    setEditingCostCenter(null);
    setCostCenterFormData({
      code: `CC-${String((formData.costCenters?.length || 0) + 1).padStart(2, '0')}`,
      nameAr: '',
      nameEn: '',
    });
    setIsCostCenterModalOpen(true);
  };

  const handleOpenEditCostCenter = (cc: CostCenter) => {
    setEditingCostCenter(cc);
    setCostCenterFormData({ ...cc });
    setIsCostCenterModalOpen(true);
  };

  const handleSaveCostCenterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!costCenterFormData.nameAr?.trim() || !costCenterFormData.code?.trim()) {
      alert('يرجى إدخال رمز واسم مركز التكلفة');
      return;
    }

    let updatedCC: CostCenter[];
    if (editingCostCenter) {
      updatedCC = (formData.costCenters || []).map(c => 
        c.id === editingCostCenter.id ? ({ ...c, ...costCenterFormData } as CostCenter) : c
      );
    } else {
      const newCC: CostCenter = {
        id: `cc-${Date.now()}`,
        code: costCenterFormData.code!.trim().toUpperCase(),
        nameAr: costCenterFormData.nameAr!.trim(),
        nameEn: costCenterFormData.nameEn?.trim() || costCenterFormData.nameAr!.trim(),
      };
      updatedCC = [...(formData.costCenters || []), newCC];
    }

    const updatedComp = {
      ...formData,
      costCenters: updatedCC
    };
    setFormData(updatedComp);
    onUpdateCompany(updatedComp);
    setIsCostCenterModalOpen(false);
  };

  const handleDeleteCostCenter = (cc: CostCenter) => {
    const assignedCount = companyEmployees.filter(e => e.costCenterId === cc.id).length;
    if (assignedCount > 0) {
      if (!confirm(`يوجد ${assignedCount} موظفاً مسجلين على مركز التكلفة (${cc.nameAr}). هل تريد بالتأكيد حذفه؟`)) {
        return;
      }
    } else {
      if (!confirm(`هل أنت متأكد من حذف مركز التكلفة (${cc.nameAr})؟`)) return;
    }

    const updatedCC = (formData.costCenters || []).filter(c => c.id !== cc.id);
    const updatedComp = {
      ...formData,
      costCenters: updatedCC
    };
    setFormData(updatedComp);
    onUpdateCompany(updatedComp);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Company Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="relative group shrink-0">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border-2 border-slate-200 overflow-hidden flex items-center justify-center shadow-inner">
                {formData.logo ? (
                  <img src={formData.logo} alt={formData.nameAr} className="w-full h-full object-contain p-1" />
                ) : (
                  <Building2 className="w-8 h-8 text-emerald-600" />
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex flex-col items-center justify-center text-[10px] font-bold cursor-pointer"
                title="تغيير الشعار"
              >
                <Upload className="w-4 h-4 mb-0.5" />
                <span>تغيير</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </div>

            {/* Titles */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  {formData.nameAr || 'ملف المنشأة'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-mono font-bold">
                  كود: {formData.companyCode}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                  سجل تجاري: {formData.crNumber}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                {formData.nameEn || 'Company Profile & Organizational Structure'} | {companyEmployees.length} موظف مسجل | {companyUsers.length} مستخدم مفوض
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => handleSaveCompany()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>حفظ تعديلات المنشأة</span>
            </button>
          </div>

        </div>

        {/* Success Alert */}
        {saveSuccessMessage && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saveSuccessMessage}</span>
            </div>
            <button onClick={() => setSaveSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Sub-tabs Navigation */}
        <div className="flex items-center gap-1.5 mt-6 pt-4 border-t border-slate-100 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveSubTab('details')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'details'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>البيانات الأساسية والحكومية</span>
          </button>

          <button
            onClick={() => setActiveSubTab('banking')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'banking'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>الحساب البنكي والسويفت (WPS)</span>
          </button>

          <button
            onClick={() => setActiveSubTab('qoyod')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'qoyod'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-4 h-4 text-sky-400" />
            <span>تكامل برنامج قيود (Qoyod API)</span>
          </button>

          <button
            onClick={() => setActiveSubTab('users')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'users'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>المستخدمون المفوضون ({companyUsers.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('departments')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'departments'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            <span>الأقسام الإدارية ({departmentsList.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('cost_centers')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'cost_centers'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>مراكز التكلفة ({formData.costCenters?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('policies')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'policies'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>قواعد الاحتساب والتأمينات (GOSI)</span>
          </button>

          <button
            onClick={() => setActiveSubTab('accounts')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'accounts'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            <span>شجرة الحسابات</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: Basic & Government Details */}
      {activeSubTab === 'details' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">بيانات التسجيل الحكومي والمنشأة</h3>
              <p className="text-xs text-slate-500">تعديل بيانات السجل التجاري، الرقم الضريبي، واشتراك التأمينات الاجتماعية</p>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              متوافق مع وزارة الموارد البشرية وهيئة الزكاة والضريبة والجمارك (ZATCA)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Arabic Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم المنشأة الرسمي بالعربية *</label>
              <input
                type="text"
                required
                value={formData.nameAr}
                onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 font-semibold text-slate-900"
                placeholder="مثال: شركة التقنية المتقدمة المحدودة"
              />
            </div>

            {/* English Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم المنشأة بالإنجليزية (English Name)</label>
              <input
                type="text"
                value={formData.nameEn || ''}
                onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 text-slate-900 font-medium"
                placeholder="Advanced Tech Digital Solutions Ltd."
                dir="ltr"
              />
            </div>

            {/* Company Code */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رمز المنشأة الداخلي (Company Code) *</label>
              <input
                type="text"
                required
                value={formData.companyCode}
                onChange={(e) => setFormData({ ...formData, companyCode: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                placeholder="101"
              />
            </div>

            {/* Commercial Registration (CR) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">رقم السجل التجاري (C.R. Number) *</label>
                {formData.crNumber && (
                  validateSaudiCR(formData.crNumber) ? (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> سجل صحيح (10 أرقام)
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5">
                      <AlertCircle className="w-3 h-3" /> 10 أرقام
                    </span>
                  )
                )}
              </div>
              <input
                type="text"
                required
                value={formData.crNumber}
                onChange={(e) => setFormData({ ...formData, crNumber: e.target.value.replace(/[^0-9]/g, '') })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                placeholder="1010XXXXXX"
                maxLength={10}
              />
            </div>

            {/* Tax Number (VAT) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">الرقم الضريبي (VAT / Tax No) *</label>
                {formData.taxNumber && (
                  validateSaudiTaxNumber(formData.taxNumber) ? (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> رقم ضريبي صحيح
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5">
                      <AlertCircle className="w-3 h-3" /> 15 رقماً يبدأ وينتهي بـ 3
                    </span>
                  )
                )}
              </div>
              <input
                type="text"
                required
                value={formData.taxNumber}
                onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value.replace(/[^0-9]/g, '') })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                placeholder="300XXXXXXXXXXX3"
                maxLength={15}
              />
            </div>

            {/* GOSI Establishment Number */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم اشتراك التأمينات الاجتماعية (GOSI No) *</label>
              <input
                type="text"
                required
                value={formData.gosiEstablishmentNo}
                onChange={(e) => setFormData({ ...formData, gosiEstablishmentNo: e.target.value.replace(/[^0-9]/g, '') })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                placeholder="900XXXXX"
              />
            </div>

            {/* Currency */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">العملة الأساسية</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold text-slate-900"
              >
                <option value="SAR">ريال سعودي (SAR - ر.س)</option>
                <option value="USD">دولار أمريكي (USD - $)</option>
                <option value="AED">درهم إماراتي (AED)</option>
              </select>
            </div>

            {/* Timezone */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المنطقة الزمنية</label>
              <input
                type="text"
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono text-slate-900"
              />
            </div>

            {/* Fiscal Year Start */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">شهر بداية السنة المالية</label>
              <select
                value={formData.fiscalYearStartMonth}
                onChange={(e) => setFormData({ ...formData, fiscalYearStartMonth: parseInt(e.target.value, 10) || 1 })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold text-slate-900"
              >
                <option value={1}>يناير (January - 01)</option>
                <option value={4}>أبريل (April - 04)</option>
                <option value={7}>يوليو (July - 07)</option>
                <option value={10}>أكتوبر (October - 10)</option>
              </select>
            </div>
          </div>

          {/* Logo Customizer */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white border border-slate-300 p-1 flex items-center justify-center shrink-0">
                {formData.logo ? (
                  <img src={formData.logo} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <ImageIcon className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">شعار المنشأة المعتمد (Company Logo)</h4>
                <p className="text-[11px] text-slate-500">يظهر في التقارير الرسمية، قسائم الرواتب، وكشوفات حماية الأجور</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>رفع شعار جديد</span>
              </button>
              {formData.logo && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, logo: undefined })}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>إزالة</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="button"
              onClick={() => handleSaveCompany()}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>حفظ البيانات الأساسية</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: Banking & WPS Details */}
      {activeSubTab === 'banking' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">الحساب البنكي وبيانات نظام حماية الأجور (WPS)</h3>
              <p className="text-xs text-slate-500">الحساب البنكي المعتمد لصرف رواتب المنشأة ورموز السويفت (SWIFT/BIC)</p>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              معتمد من البنك المركزي السعودي (SAMA)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Bank Name */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">بنك صرف الرواتب للمنشأة *</label>
                <span className="text-[10px] text-slate-400">قائمة البنوك السعودية</span>
              </div>
              <select
                value={formData.bankName || ''}
                onChange={(e) => {
                  const newBank = e.target.value;
                  const swift = getSwiftCodeFromBankName(newBank);
                  setFormData({ 
                    ...formData, 
                    bankName: newBank,
                    bankSwiftCode: swift || formData.bankSwiftCode || ''
                  });
                }}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 font-semibold text-slate-900"
              >
                <option value="">-- اختر البنك --</option>
                {Object.values(SAUDI_BANKS).map(b => (
                  <option key={b.code} value={b.nameAr}>
                    {b.nameAr} ({b.swiftCode})
                  </option>
                ))}
              </select>
            </div>

            {/* IBAN */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">رقم الآيبان البنكي للمنشأة (IBAN) *</label>
                {formData.bankIban && (
                  validateSaudiIBAN(formData.bankIban) ? (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> آيبان صحيح
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5">
                      <AlertCircle className="w-3 h-3" /> 24 خانة تبدأ بـ SA
                    </span>
                  )
                )}
              </div>
              <input
                type="text"
                required
                value={formData.bankIban || ''}
                onChange={(e) => {
                  const cleanIban = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                  const detected = detectBankFromIBAN(cleanIban);
                  setFormData({ 
                    ...formData, 
                    bankIban: cleanIban,
                    bankName: detected ? detected.nameAr : formData.bankName,
                    bankSwiftCode: detected ? detected.swiftCode : formData.bankSwiftCode
                  });
                }}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900 tracking-wider"
                placeholder="SA4480000XXXXXXXXXXXXXXXX"
                dir="ltr"
              />
            </div>

            {/* SWIFT / BIC */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">رمز السويفت (SWIFT / BIC Code)</label>
                <button
                  type="button"
                  onClick={() => {
                    let code = '';
                    if (formData.bankIban) {
                      const det = detectBankFromIBAN(formData.bankIban);
                      if (det) code = det.swiftCode;
                    }
                    if (!code && formData.bankName) {
                      code = getSwiftCodeFromBankName(formData.bankName);
                    }
                    if (code) {
                      setFormData({ ...formData, bankSwiftCode: code });
                    } else {
                      alert('يرجى تحديد البنك أو إدخال رقم الآيبان لتوليد رمز السويفت');
                    }
                  }}
                  className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 cursor-pointer"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>توليد تلقائي</span>
                </button>
              </div>
              <input
                type="text"
                value={formData.bankSwiftCode || ''}
                onChange={(e) => setFormData({ ...formData, bankSwiftCode: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900 uppercase"
                placeholder="RJHISARI"
                dir="ltr"
                maxLength={11}
              />
              <div className="mt-1 flex items-center justify-between text-[10px]">
                {formData.bankSwiftCode ? (
                  validateSwiftCode(formData.bankSwiftCode) ? (
                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> معتمد قياسياً (ISO 9362)
                    </span>
                  ) : (
                    <span className="text-amber-600 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-2.5 h-2.5" /> التنسيق القياسي: 8 إلى 11 حرفاً
                    </span>
                  )
                ) : (
                  <span className="text-slate-400">يتولد تلقائياً من رقم الآيبان</span>
                )}
                <span className="text-slate-400 font-mono">{(formData.bankSwiftCode || '').length}/11</span>
              </div>
            </div>

            {/* Payroll Cut-off Day */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">يوم إقفال مسير الرواتب الشهري (Cut-off Day)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={formData.payrollCutoffDay}
                  onChange={(e) => setFormData({ ...formData, payrollCutoffDay: parseInt(e.target.value, 10) || 25 })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                />
                <span className="text-xs text-slate-500 font-medium whitespace-nowrap">من كل شهر ميلادي</span>
              </div>
            </div>

            {/* Payroll Payment Day */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">يوم تحويل وصرف الرواتب (Payment Day)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={formData.payrollPaymentDay}
                  onChange={(e) => setFormData({ ...formData, payrollPaymentDay: parseInt(e.target.value, 10) || 27 })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                />
                <span className="text-xs text-slate-500 font-medium whitespace-nowrap">من كل شهر ميلادي</span>
              </div>
            </div>

            {/* Work days per month */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">أيام العمل المعيارية شهرياً لحساب أجر اليوم</label>
              <select
                value={formData.workDaysPerMonth}
                onChange={(e) => setFormData({ ...formData, workDaysPerMonth: parseInt(e.target.value, 10) || 30 })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold text-slate-900"
              >
                <option value={30}>30 يوماً (المعيار الشائع لنظام العمل السعودي)</option>
                <option value={26}>26 يوماً (خصم يوم الراحة الأسبوعية)</option>
                <option value={22}>22 يوماً (الدوام 5 أيام أسبوعياً)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="button"
              onClick={() => handleSaveCompany()}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>حفظ الإعدادات البنكية ومسيرات الرواتب</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB: Qoyod Accounting Integration */}
      {activeSubTab === 'qoyod' && (() => {
        // Generate a sample batch or current company batch for live payload preview
        const dummyRun: PayrollRun = {
          id: 'run-sample',
          companyId: formData.id,
          periodMonth: new Date().toISOString().substring(0, 7),
          startDate: `${new Date().toISOString().substring(0, 7)}-01`,
          endDate: `${new Date().toISOString().substring(0, 7)}-28`,
          status: 'DRAFT',
          employeesCount: companyEmployees.length || 12,
          totalBaseSalaries: 145000,
          totalAllowances: 60750,
          totalOvertime: 7500,
          totalGrossSalaries: 213250,
          totalAbsenceDeductions: 1500,
          totalDelayDeductions: 500,
          totalGosiEmployee: 14625,
          totalGosiEmployer: 19875,
          totalLoanDeductions: 8000,
          totalPenalties: 0,
          totalDeductions: 24625,
          totalNetSalaries: 188625,
          totalCompanyCost: 233125,
          items: [
            {
              id: 'sample-item-1',
              payrollRunId: 'run-sample',
              employeeId: 'emp-sample-1',
              employeeNo: 'EMP-001',
              employeeName: 'نموذج موظف إداري',
              department: 'الإدارة العامة',
              costCenterId: formData.costCenters?.[0]?.id || 'CC-DEFAULT',
              nationality: 'SAUDI',
              bankIban: formData.bankIban || 'SA0000000000000000000000',
              bankName: formData.bankName || 'البنك الأهلي السعودي',
              baseSalary: 145000,
              housingAllowance: 36250,
              transportAllowance: 14500,
              otherAllowances: 10000,
              overtimeAmount: 7500,
              overtimeHours: 20,
              bonuses: 0,
              totalGrossSalary: 213250,
              delayMinutes: 0,
              delayDeduction: 500,
              absenceDays: 0,
              absenceDeduction: 1500,
              unpaidLeaveDays: 0,
              unpaidLeaveDeduction: 0,
              gosiEmployeeShare: 14625,
              loanDeduction: 8000,
              penaltiesDeduction: 0,
              otherDeductions: 0,
              totalDeductions: 24625,
              netSalary: 188625,
              gosiEmployerShare: 19875,
              totalCompanyBurden: 233125,
              isSuspended: false,
              warningFlags: [],
            }
          ],
          createdAt: new Date().toISOString(),
          calculatedAt: new Date().toISOString(),
        };

        const sampleBatch = generatePayrollJournalBatch(formData, dummyRun);
        const qoyodPayload = buildQoyodJournalPayload(sampleBatch, formData);
        const qoyodCurl = generateQoyodCurlCommand(qoyodPayload, qConfig.apiKey, qConfig.baseUrl);

        const handleSaveQoyodSettings = (e?: React.FormEvent) => {
          if (e) e.preventDefault();
          if (onSaveQoyodConfig) {
            onSaveQoyodConfig(qConfig);
          }
          setSaveSuccessMessage('تم حفظ إعدادات وتكوين الربط مع قيود (Qoyod API 2.0) بنجاح');
          setTimeout(() => setSaveSuccessMessage(null), 4000);
        };

        const handleTestQoyodConnection = () => {
          setIsTestingQoyod(true);
          setQoyodTestResult(null);
          setTimeout(() => {
            setIsTestingQoyod(false);
            if (qConfig.apiKey && qConfig.apiKey.trim().length > 6) {
              setQoyodTestResult({
                status: 'SUCCESS',
                message: `تم التحقق بنجاح من صلاحية مفتاح API-KEY مع خادم قيود (${qConfig.baseUrl || 'https://api.qoyod.com/2.0'}) لمنشأة: ${formData.nameAr}`,
              });
              const updatedConfig = { ...qConfig, lastTestStatus: 'SUCCESS' as const, lastTestMessage: 'الاتصال نشط' };
              setQConfig(updatedConfig);
              if (onSaveQoyodConfig) onSaveQoyodConfig(updatedConfig);
            } else {
              setQoyodTestResult({
                status: 'FAILED',
                message: 'يرجى إدخال مفتاح API-KEY الصحيح المستخرج من لوحة تحكم قيود (الإعدادات > مفاتيح الـ API)',
              });
            }
          }, 600);
        };

        const handleDirectSync = async () => {
          if (!qConfig.apiKey || qConfig.apiKey.trim().length < 5) {
            alert('يرجى حفظ وإدخال مفتاح API-KEY أولاً');
            return;
          }

          setIsSyncingQoyod(true);
          setQoyodSyncSuccess(null);
          try {
            const res = await sendJournalEntryToQoyod(sampleBatch, formData, qConfig);
            setIsSyncingQoyod(false);
            if (res.success) {
              setQoyodSyncSuccess(res.message);
            } else {
              alert(res.message);
            }
          } catch (err: any) {
            setIsSyncingQoyod(false);
            alert(`خطأ أثناء الاتصال بخادم قيود: ${err.message || err}`);
          }
        };

        return (
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
            
            {/* Header Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-200 shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      تكامل نظام قيود المحاسبي (Qoyod API 2.0 Integration)
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 font-mono text-[10px] font-bold">
                      POST /2.0/journal_entries
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    الربط الآلي المباشر لترحيل قيود الرواتب والبدلات والاستقطاعات لشجرة حسابات قيود لمنشأة {formData.nameAr}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onOpenQoyodModal && (
                  <button
                    type="button"
                    onClick={onOpenQoyodModal}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>نافذة الترحيل السريع</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => exportQoyodJournalCsv(sampleBatch, formData)}
                  className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>تصدير قيد CSV لقيود</span>
                </button>
              </div>
            </div>

            {/* Test or Sync Alert */}
            {qoyodTestResult && (
              <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
                qoyodTestResult.status === 'SUCCESS'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border-rose-200'
              }`}>
                {qoyodTestResult.status === 'SUCCESS' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="text-xs font-bold leading-relaxed">
                  {qoyodTestResult.message}
                </div>
              </div>
            )}

            {qoyodSyncSuccess && (
              <div className="p-4 rounded-2xl bg-sky-50 text-sky-900 border border-sky-200 flex items-start gap-3 font-bold text-xs">
                <CheckCircle2 className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{qoyodSyncSuccess}</div>
              </div>
            )}

            {/* Mode Switcher */}
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <button
                type="button"
                onClick={() => setQoyodViewMode('config')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  qoyodViewMode === 'config'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                إعدادات الـ API والمفتاح
              </button>

              <button
                type="button"
                onClick={() => setQoyodViewMode('payload')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  qoyodViewMode === 'payload'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Code className="w-3.5 h-3.5 text-emerald-500" />
                <span>حزمة البيانات المعتمدة (JSON Payload)</span>
              </button>

              <button
                type="button"
                onClick={() => setQoyodViewMode('curl')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  qoyodViewMode === 'curl'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-purple-400" />
                <span>أمر cURL الجاهز</span>
              </button>
            </div>

            {/* View 1: Configuration Form */}
            {qoyodViewMode === 'config' && (
              <form onSubmit={handleSaveQoyodSettings} className="space-y-4">
                
                {/* Endpoint Display */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 block">نقطة النهاية الرسمية لبرنامج قيود (API Endpoint):</span>
                    <span className="font-mono text-xs font-bold text-slate-900" dir="ltr">
                      POST https://api.qoyod.com/2.0/journal_entries
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                      Header: API-KEY
                    </span>
                    <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-mono font-bold">
                      Header: Content-Type: application/json
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* API KEY */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-slate-500" />
                        <span>مفتاح API الخاص بحساب المنشأة في قيود (API-KEY) *</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">من لوحة تحكم قيود &gt; الإعدادات &gt; مفاتيح API</span>
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={qConfig.apiKey || ''}
                        onChange={(e) => setQConfig({ ...qConfig, apiKey: e.target.value })}
                        placeholder="أدخل مفتاح API-KEY هنا (مثال: 9a78f2bc904845b4b76e271...)"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute left-2.5 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                        title={showApiKey ? 'إخفاء' : 'إظهار'}
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Base URL */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">رابط خادم قيود (Base URL)</label>
                    <input
                      type="text"
                      value={qConfig.baseUrl || 'https://api.qoyod.com/2.0'}
                      onChange={(e) => setQConfig({ ...qConfig, baseUrl: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:bg-white text-slate-800 font-bold"
                      dir="ltr"
                    />
                  </div>

                  {/* Organization ID */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">معرف المنشأة في قيود (Organization ID)</label>
                    <input
                      type="text"
                      value={qConfig.organizationId || ''}
                      onChange={(e) => setQConfig({ ...qConfig, organizationId: e.target.value })}
                      placeholder="اختياري"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:bg-white text-slate-800"
                    />
                  </div>
                </div>

                {/* Auto Sync Toggle */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-900">المزامنة التلقائية عند اعتماد مسير الرواتب</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">ترحيل قيد اليومية آلياً إلى قيود فور اعتماد المسير الشهري من قبل المعتمدين</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={qConfig.autoSyncOnApprove || false}
                    onChange={(e) => setQConfig({ ...qConfig, autoSyncOnApprove: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTestQoyodConnection}
                      disabled={isTestingQoyod}
                      className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTestingQoyod ? 'animate-spin' : ''}`} />
                      <span>اختبار الاتصال بالخادم</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDirectSync}
                      disabled={isSyncingQoyod}
                      className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                    >
                      <Send className={`w-3.5 h-3.5 ${isSyncingQoyod ? 'animate-spin' : ''}`} />
                      <span>{isSyncingQoyod ? 'جاري الترحيل...' : 'تجربة ترحيل قيد تجريبي لقيود'}</span>
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>حفظ إعدادات قيود للمنشأة</span>
                  </button>
                </div>

              </form>
            )}

            {/* View 2: JSON Payload */}
            {qoyodViewMode === 'payload' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-600 font-bold">
                    حزمة بيانات قيد الرواتب المطابقة لتوثيق قيود 2.0 (Payload):
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(qoyodPayload, null, 2));
                      setCopiedJson(true);
                      setTimeout(() => setCopiedJson(false), 2000);
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedJson ? 'تم النسخ' : 'نسخ كود JSON'}</span>
                  </button>
                </div>

                <pre className="bg-slate-900 text-emerald-400 p-4 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-80 border border-slate-800 leading-relaxed" dir="ltr">
                  {JSON.stringify(qoyodPayload, null, 2)}
                </pre>
              </div>
            )}

            {/* View 3: cURL Command */}
            {qoyodViewMode === 'curl' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-600 font-bold">
                    أمر cURL الجاهز للتشغيل في Terminal أو Postman:
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(qoyodCurl);
                      setCopiedCurl(true);
                      setTimeout(() => setCopiedCurl(false), 2000);
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCurl ? 'تم النسخ' : 'نسخ أمر cURL'}</span>
                  </button>
                </div>

                <pre className="bg-slate-900 text-purple-300 p-4 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-80 border border-slate-800 leading-relaxed whitespace-pre" dir="ltr">
                  {qoyodCurl}
                </pre>
              </div>
            )}

          </div>
        );
      })()}

      {/* SUB-TAB 3: Company Users Management */}
      {activeSubTab === 'users' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">المستخدمون المفوضون لإدارة منشأة {formData.nameAr}</h3>
              <p className="text-xs text-slate-500">إضافة وتعيين مستخدمين وصلاحيات الدخول الخاصة بهذه المنشأة</p>
            </div>
            <button
              type="button"
              onClick={handleOpenAddUser}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm self-start"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة مستخدم جديد للمنشأة</span>
            </button>
          </div>

          {/* Users List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {companyUsers.map((u) => {
              const roleData = ROLE_INFO[u.role] || ROLE_INFO.EMPLOYEE;
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
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-700">أنت</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono">@{u.username}</p>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${roleData.badgeBg} ${roleData.color}`}>
                      {roleData.labelAr.split(' ')[0]}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] text-slate-600 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">البريد:</span>
                      <span className="font-medium truncate max-w-[150px]">{u.email || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">الهاتف:</span>
                      <span className="font-mono">{u.phone || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">الحالة:</span>
                      <span className={`font-bold ${u.isActive ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {u.isActive ? 'مفعل ونشط' : 'معطل مؤقتاً'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="text-[10px] text-slate-400">
                      الدور: <span className="font-bold text-slate-700">{roleData.labelAr.split(' (')[0]}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditUser(u)}
                        className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs"
                        title="تعديل المستخدم"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      {onDeleteUser && !isCurrentUser && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`هل أنت متأكد من حذف المستخدم (${u.name})؟`)) {
                              onDeleteUser(u.id);
                            }
                          }}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg text-xs"
                          title="حذف المستخدم"
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
      )}

      {/* SUB-TAB 4: Departments Management */}
      {activeSubTab === 'departments' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">الهيكل الإداري والأقسام لمنشأة {formData.nameAr}</h3>
              <p className="text-xs text-slate-500">إضافة وتعديل الأقسام وتعيين مدراء الإدارات وربط الموظفين</p>
            </div>
            <button
              type="button"
              onClick={handleOpenAddDept}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm self-start"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة قسم جديد</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {departmentsList.map((dept) => {
              const assignedEmployees = companyEmployees.filter(e => e.department === dept.nameAr);

              return (
                <div key={dept.id} className="p-4 rounded-2xl border border-slate-200/80 bg-white hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                        {dept.code}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 mt-1">{dept.nameAr}</h4>
                      {dept.nameEn && <p className="text-[11px] text-slate-400 font-medium" dir="ltr">{dept.nameEn}</p>}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditDept(dept)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                        title="تعديل القسم"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDept(dept)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                        title="حذف القسم"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 line-clamp-2 mb-3 min-h-[32px]">
                    {dept.description || 'لا يوجد وصف إضافي للقسم'}
                  </p>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="text-slate-600">
                      <span className="text-[11px] text-slate-400 block">مدير / رئيس القسم:</span>
                      <span className="font-bold text-[11px] text-slate-800">{dept.headName || 'غير محدد'}</span>
                    </div>

                    <div className="text-left">
                      <span className="text-[11px] text-slate-400 block">الموظفين:</span>
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md text-[11px]">
                        <Users className="w-3 h-3" />
                        {assignedEmployees.length} موظف
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 5: Cost Centers */}
      {activeSubTab === 'cost_centers' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">مراكز التكلفة المحاسبية (Cost Centers)</h3>
              <p className="text-xs text-slate-500">توزيع مصاريف الرواتب والمخصصات على مراكز التكلفة المختلفة لترحيل القيود بدقة</p>
            </div>
            <button
              type="button"
              onClick={handleOpenAddCostCenter}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm self-start"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة مركز تكلفة جديد</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(formData.costCenters || []).map((cc) => {
              const assignedEmpCount = companyEmployees.filter(e => e.costCenterId === cc.id).length;

              return (
                <div key={cc.id} className="p-4 rounded-2xl border border-slate-200/80 bg-white hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-mono text-[10px] font-bold border border-emerald-200">
                        {cc.code}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 mt-1">{cc.nameAr}</h4>
                      {cc.nameEn && <p className="text-[11px] text-slate-400 font-medium" dir="ltr">{cc.nameEn}</p>}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditCostCenter(cc)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                        title="تعديل مركز التكلفة"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCostCenter(cc)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                        title="حذف مركز التكلفة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-400">الموظفين المنسوبين للمركز:</span>
                    <span className="font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg text-[11px]">
                      {assignedEmpCount} موظف
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 6: Policies & GOSI Calculation */}
      {activeSubTab === 'policies' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">قواعد احتساب الرواتب ونسب التأمينات الاجتماعية (GOSI)</h3>
              <p className="text-xs text-slate-500">ضبط معادلات الخصومات، البدلات، الإضافي، وسقف اشتراك التأمينات للمواطنين والمقيمين</p>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              متوافق مع التعديلات المعتمدة للمؤسسة العامة للتأمينات الاجتماعية
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Daily Rate Formula */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">أساس حساب أجر اليوم والغياب</label>
              <select
                value={formData.calculationRules?.dailyRateFormula || 'BASE_PLUS_FIXED'}
                onChange={(e) => setFormData({
                  ...formData,
                  calculationRules: {
                    ...formData.calculationRules!,
                    dailyRateFormula: e.target.value as any
                  }
                })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold text-slate-900"
              >
                <option value="BASE_PLUS_FIXED">الراتب الأساسي + البدلات الثابتة (شائع في نظام العمل)</option>
                <option value="BASE_PLUS_HOUSING">الراتب الأساسي + بدل السكن فقط</option>
                <option value="BASE_ONLY">الراتب الأساسي فقط (Base Salary Only)</option>
              </select>
            </div>

            {/* Monthly Working Days */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">أيام العمل الشهرية المعتمدة للحساب</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min="20"
                  max="31"
                  value={formData.workDaysPerMonth || 30}
                  onChange={(e) => setFormData({
                    ...formData,
                    workDaysPerMonth: parseInt(e.target.value) || 30,
                    calculationRules: {
                      ...formData.calculationRules!,
                      workDaysDivisor: parseInt(e.target.value) || 30
                    }
                  })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                />
                <span className="text-xs font-bold text-slate-600">يوم / شهر</span>
              </div>
            </div>

            {/* Daily Working Hours */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ساعات العمل اليومية الرسمية</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="4"
                  max="12"
                  value={formData.workHoursPerDay || 8}
                  onChange={(e) => setFormData({
                    ...formData,
                    workHoursPerDay: parseFloat(e.target.value) || 8,
                    calculationRules: {
                      ...formData.calculationRules!,
                      hourlyRateDivisor: parseFloat(e.target.value) || 8
                    }
                  })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                />
                <span className="text-xs font-bold text-slate-600">ساعة / يوم</span>
              </div>
            </div>

            {/* Delay Grace Period */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">فترة السماح للتأخير قبل بدء الخصم</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="60"
                  value={formData.calculationRules?.delayGracePeriodMinutes ?? 15}
                  onChange={(e) => setFormData({
                    ...formData,
                    calculationRules: {
                      ...formData.calculationRules!,
                      delayGracePeriodMinutes: parseInt(e.target.value) || 0
                    }
                  })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                />
                <span className="text-xs font-bold text-slate-600">دقيقة</span>
              </div>
            </div>

            {/* Absence Day Multiplier */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مضاعف خصم يوم الغياب بدون إذن</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.25"
                  min="1"
                  max="3"
                  value={formData.calculationRules?.absenceDayMultiplier || 1.0}
                  onChange={(e) => setFormData({
                    ...formData,
                    calculationRules: {
                      ...formData.calculationRules!,
                      absenceDayMultiplier: parseFloat(e.target.value) || 1.0
                    }
                  })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                />
                <span className="text-xs font-bold text-slate-600">يوم (1x أو 2x)</span>
              </div>
            </div>

            {/* Standard Overtime Rate */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مضاعف العمل الإضافي بالأيام العادية</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="3"
                  value={formData.calculationRules?.overtimeStandardRate || 1.5}
                  onChange={(e) => setFormData({
                    ...formData,
                    calculationRules: {
                      ...formData.calculationRules!,
                      overtimeStandardRate: parseFloat(e.target.value) || 1.5
                    }
                  })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                />
                <span className="text-xs font-bold text-slate-600">ضعف (1.5x)</span>
              </div>
            </div>

            {/* Weekend Overtime Rate */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مضاعف العمل الإضافي في العطلات والأعياد</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="3"
                  value={formData.calculationRules?.overtimeWeekendRate || 2.0}
                  onChange={(e) => setFormData({
                    ...formData,
                    calculationRules: {
                      ...formData.calculationRules!,
                      overtimeWeekendRate: parseFloat(e.target.value) || 2.0
                    }
                  })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                />
                <span className="text-xs font-bold text-slate-600">ضعف (2.0x)</span>
              </div>
            </div>

            {/* Saudi Employee GOSI */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نسبة استقطاع التأمينات من الموظف السعودي</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.0025"
                  value={Number(((formData.calculationRules?.saudiGosiEmployeeRate || 0.0975) * 100).toFixed(3))}
                  onChange={(e) => setFormData({
                    ...formData,
                    calculationRules: {
                      ...formData.calculationRules!,
                      saudiGosiEmployeeRate: parseFloat(e.target.value) / 100 || 0.0975
                    }
                  })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                />
                <span className="text-xs font-bold text-slate-600">% (9.75%)</span>
              </div>
            </div>

            {/* Saudi Employer GOSI */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نسبة مساهمة المنشأة في تأمينات الموظف السعودي</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.0025"
                  value={Number(((formData.calculationRules?.saudiGosiEmployerRate || 0.1175) * 100).toFixed(3))}
                  onChange={(e) => setFormData({
                    ...formData,
                    calculationRules: {
                      ...formData.calculationRules!,
                      saudiGosiEmployerRate: parseFloat(e.target.value) / 100 || 0.1175
                    }
                  })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                />
                <span className="text-xs font-bold text-slate-600">% (11.75%)</span>
              </div>
            </div>

            {/* GOSI Max Cap */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الحد الأقصى للراتب الخاضع للتأمينات (Max Cap)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1000"
                  value={formData.calculationRules?.saudiGosiMaxCap || 45000}
                  onChange={(e) => setFormData({
                    ...formData,
                    calculationRules: {
                      ...formData.calculationRules!,
                      saudiGosiMaxCap: parseFloat(e.target.value) || 45000
                    }
                  })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                />
                <span className="text-xs font-bold text-slate-600">ريال سعودي</span>
              </div>
            </div>

            {/* Non-Saudi Hazard Rate */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نسبة الأخطار المهنية للموظف غير السعودي</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.005"
                  value={Number(((formData.calculationRules?.nonSaudiGosiEmployerHazardRate || 0.02) * 100).toFixed(2))}
                  onChange={(e) => setFormData({
                    ...formData,
                    calculationRules: {
                      ...formData.calculationRules!,
                      nonSaudiGosiEmployerHazardRate: parseFloat(e.target.value) / 100 || 0.02
                    }
                  })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                />
                <span className="text-xs font-bold text-slate-600">% (2%)</span>
              </div>
            </div>

            {/* Rounding Decimals */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">دقة التقريب العشري للمبالغ المالية</label>
              <select
                value={formData.calculationRules?.roundingDecimals ?? 2}
                onChange={(e) => setFormData({
                  ...formData,
                  calculationRules: {
                    ...formData.calculationRules!,
                    roundingDecimals: parseInt(e.target.value) || 2
                  }
                })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold text-slate-900"
              >
                <option value="2">منزلتين عشريتين (هللات - 0.00)</option>
                <option value="0">أقرب ريال صحيح (بدون كسور)</option>
                <option value="3">ثلاث منازل عشرية (0.000)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="button"
              onClick={() => handleSaveCompany()}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>حفظ سياسات الرواتب والتأمينات</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB 7: Chart of Accounts */}
      {activeSubTab === 'accounts' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">ربط شجرة الحسابات المحاسبية لقيود الرواتب</h3>
              <p className="text-xs text-slate-500">أرقام الحسابات في النظام المحاسبي (تكامل برنامج قيود والأنظمة المحاسبية)</p>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              متوافق مع معايير المحاسبة الدولية IFRS
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries({
              salariesExpenseAccount: 'حساب مصروف الرواتب الأساسية',
              housingAllowanceAccount: 'حساب مصروف بدل السكن',
              transportAllowanceAccount: 'حساب مصروف بدل النقل',
              overtimeExpenseAccount: 'حساب مصروف العمل الإضافي',
              otherAllowancesExpenseAccount: 'حساب مصروف البدلات الأخرى',
              gosiEmployerExpenseAccount: 'حساب مصروف مساهمة المنشأة في التأمينات',
              salariesPayableAccount: 'حساب الرواتب المستحقة (التزامات)',
              gosiPayableAccount: 'حساب التأمينات الاجتماعية المستحقة',
              employeeAdvancesAccount: 'حساب سلف الموظفين (أصول متداولة)',
              penaltiesPayableAccount: 'حساب الجزاءات والخصومات',
              bankAccount: 'حساب البنك / النقدية للصرف',
            }).map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs font-bold text-slate-700 mb-1">{label}</label>
                <input
                  type="text"
                  value={(formData.chartOfAccounts as any)?.[key] || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    chartOfAccounts: {
                      ...formData.chartOfAccounts!,
                      [key]: e.target.value
                    }
                  })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="button"
              onClick={() => handleSaveCompany()}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>حفظ دليل الحسابات</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* USER MODAL */}
      {/* ========================================================================= */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingUser ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم جديد للمنشأة'}
                  </h3>
                  <p className="text-xs text-slate-500">منشأة: {formData.nameAr}</p>
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الكامل *</label>
                  <input
                    type="text"
                    required
                    value={userFormData.name || ''}
                    onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    placeholder="مثال: خالد محمد السالم"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم المستخدم (Username) *</label>
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
                    {editingUser ? 'كلمة المرور (اتركه فارغاً للإبقاء عليها)' : 'كلمة المرور *'}
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">الدور والصلاحية *</label>
                  <select
                    value={userFormData.role || 'PAYROLL_SPECIALIST'}
                    onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold"
                  >
                    {Object.entries(ROLE_INFO).map(([key, info]) => (
                      <option key={key} value={key}>
                        {info.labelAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني</label>
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
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
                  حساب نشط ومسموح له بتسجيل الدخول
                </label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                >
                  {editingUser ? 'حفظ التعديلات' : 'إضافة المستخدم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DEPARTMENT MODAL */}
      {/* ========================================================================= */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                  <FolderTree className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingDept ? 'تعديل بيانات القسم' : 'إضافة قسم إداري جديد'}
                  </h3>
                  <p className="text-xs text-slate-500">منشأة: {formData.nameAr}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsDeptModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDeptSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رمز القسم (Code) *</label>
                <input
                  type="text"
                  required
                  value={deptFormData.code || ''}
                  onChange={(e) => setDeptFormData({ ...deptFormData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold"
                  placeholder="DEP-IT"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم القسم بالعربية *</label>
                <input
                  type="text"
                  required
                  value={deptFormData.nameAr || ''}
                  onChange={(e) => setDeptFormData({ ...deptFormData, nameAr: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold"
                  placeholder="تقنية المعلومات والتطوير"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم القسم بالإنجليزية</label>
                <input
                  type="text"
                  value={deptFormData.nameEn || ''}
                  onChange={(e) => setDeptFormData({ ...deptFormData, nameEn: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                  placeholder="Information Technology"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم مدير / رئيس القسم</label>
                <input
                  type="text"
                  value={deptFormData.headName || ''}
                  onChange={(e) => setDeptFormData({ ...deptFormData, headName: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                  placeholder="المهندس / خالد أحمد"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">وصف واختصاصات القسم</label>
                <textarea
                  rows={2}
                  value={deptFormData.description || ''}
                  onChange={(e) => setDeptFormData({ ...deptFormData, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white resize-none"
                  placeholder="مهام ومسؤوليات هذا القسم..."
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsDeptModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                >
                  {editingDept ? 'حفظ التعديلات' : 'إضافة القسم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* COST CENTER MODAL */}
      {/* ========================================================================= */}
      {isCostCenterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingCostCenter ? 'تعديل مركز التكلفة' : 'إضافة مركز تكلفة جديد'}
                  </h3>
                  <p className="text-xs text-slate-500">منشأة: {formData.nameAr}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsCostCenterModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCostCenterSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رمز مركز التكلفة (Code) *</label>
                <input
                  type="text"
                  required
                  value={costCenterFormData.code || ''}
                  onChange={(e) => setCostCenterFormData({ ...costCenterFormData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold"
                  placeholder="CC-100 أو CC-SALES"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم مركز التكلفة بالعربية *</label>
                <input
                  type="text"
                  required
                  value={costCenterFormData.nameAr || ''}
                  onChange={(e) => setCostCenterFormData({ ...costCenterFormData, nameAr: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold"
                  placeholder="المبيعات والتسويق"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الاسم بالإنجليزية</label>
                <input
                  type="text"
                  value={costCenterFormData.nameEn || ''}
                  onChange={(e) => setCostCenterFormData({ ...costCenterFormData, nameEn: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                  placeholder="Sales & Marketing"
                  dir="ltr"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCostCenterModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                >
                  {editingCostCenter ? 'حفظ التعديلات' : 'إضافة المركز'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
