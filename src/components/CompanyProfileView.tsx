Warning: truncated output (original token count: 34206)
Total output lines: 2522

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
  PayrollRun,
  QoyodApiConfig,
  JournalBatch,
  CompanyBankDefinition
} from '../types';
import { isStrongPassword, passwordPolicyMessage } from '../utils/passwordPolicy';
import { 
  validateSaudiIBAN, 
  validateSwiftCode, 
  detectBankFromIBAN, 
  getSwiftCodeFromBankName, 
  validateSaudiCR,
  validateSaudiTaxNumber,
  getBankDefinitions
} from '../utils/security';
import { buildQoyodJournalPayload, generateQoyodCurlCommand, sendJournalEntryToQoyod } from '../utils/qoyodApi';
import { exportQoyodJournalCsv } from '../utils/exportUtils';
import { generatePayrollJournalBatch } from '../utils/accountingEngine';
import { useLanguage } from '../i18n/LanguageContext';
import { CompanyProfileTabs, type ProfileSubTab } from './company/CompanyProfileTabs';
import { hasPermission } from '../utils/permissions';

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
  onDeleteAllCompanyEmployees?: (companyId: string) => void;
}

const ROLE_INFO: Record<UserRole, { labelAr: string; labelEn: string; descAr: string; descEn: string; color: string; badgeBg: string }> = {
  ADMIN: { 
    labelAr: 'مسؤول النظام (Admin)', 
    labelEn: 'System Administrator',
    descAr: 'صلاحيات كاملة وغير مقيدة على جميع الشركات والعمليات والحسابات',
    descEn: 'Full unrestricted access to all companies, operations, and accounts',
    color: 'text-purple-700 border-purple-200',
    badgeBg: 'bg-purple-50 text-purple-700'
  },
  COMPANY_MANAGER: { 
    labelAr: 'المدير العام للمنشأة',
    labelEn: 'General Manager',
    descAr: 'إدارة تشغيلية ومالية للمنشأة دون إضافة أو حذف الشركات، بصلاحيات قابلة للتخصيص',
    descEn: 'Operational and financial company management with customizable permissions, excluding company creation and deletion',
    color: 'text-indigo-700 border-indigo-200',
    badgeBg: 'bg-indigo-50 text-indigo-700'
  },
  OPERATIONS_MANAGER: {
    labelAr: 'مدير العمليات',
    labelEn: 'Operations Manager',
    descAr: 'إدارة الموظفين والرواتب والخصومات والإجازات والسلف وأوامر الدفع دون اعتماد الرواتب',
    descEn: 'Manage employees, payroll, deductions, leave, loans and payment orders without payroll approval',
    color: 'text-emerald-700 border-emerald-200',
    badgeBg: 'bg-emerald-50 text-emerald-700'
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
  onDeleteAllCompanyEmployees,
}) => {
  const { language } = useLanguage();
  const tr = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [activeSubTab, setActiveSubTab] = useState<ProfileSubTab>('details');
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [isDeleteEmployeesModalOpen, setIsDeleteEmployeesModalOpen] = useState(false);
  const [deleteEmployeesConfirmation, setDeleteEmployeesConfirmation] = useState('');

  // Local editable company state
  const [formData, setFormData] = useState<Company>(() => ({
    ...JSON.parse(JSON.stringify(company)),
    bankDefinitions: getBankDefinitions(company.bankDefinitions),
  }));
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
      setFormData({ ...JSON.parse(JSON.stringify(company)), bankDefinitions: getBankDefinitions(company.bankDefinitions) });
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
  const deleteEmployeesConfirmationValid = ['حذف جميع الموظفين', 'DELETE ALL EMPLOYEES']
    .includes(deleteEmployeesConfirmation.trim().toUpperCase());

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
    role: 'OPERATIONS_MANAGER',
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
      alert(tr('يرجى إدخال اسم المنشأة بالعربية', 'Enter the company name in Arabic.'));
      return;
    }
    if (!dataToSave.crNumber?.trim()) {
      alert(tr('يرجى إدخال رقم السجل التجاري', 'Enter the commercial registration number.'));
      return;
    }

    const bankDefinitions = (dataToSave.bankDefinitions || []).map(bank => ({
      ...bank,
      ibanBankCode: bank.ibanBankCode.trim(),
      nameAr: bank.nameAr.trim(),
      nameEn: bank.nameEn.trim(),
      swiftCode: bank.swiftCode.trim().toUpperCase(),
    }));
    const invalidBank = bankDefinitions.find(bank => !/^\d{2}$/.test(bank.ibanBankCode) || !bank.nameAr || !validateSwiftCode(bank.swiftCode));
    if (invalidBank) {
      alert(tr('راجع تعريفات البنوك: كود IBAN يجب أن يكون رقمين، واسم البنك مطلوب، وSWIFT يجب أن يكون 8 أو 11 خانة صحيحة.', 'Review bank definitions: the IBAN bank code must be two digits, the bank name is required, and SWIFT must contain 8 or 11 valid characters.'));
      return;
    }
    if (new Set(bankDefinitions.map(bank => bank.ibanBankCode)).size !== bankDefinitions.length) {
      alert(tr('لا يمكن تكرار كود IBAN لأكثر من بنك.', 'The same IBAN bank code cannot be assigned to more than one bank.'));
      return;
    }

    const normalizedCompany = { ...dataToSave, bankDefinitions };
    setFormData(normalizedCompany);
    onUpdateCompany(normalizedCompany);
    setSaveSuccessMessage(tr('تم تطبيق وحفظ كافة الإعدادات والسياسات للمنشأة بنجاح', 'Company settings and policies were saved successfully.'));
    setTimeout(() => {
      setSaveSuccessMessage(null);
    }, 4000);
  };

  // Logo file upload handler
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert(tr('حجم الصورة كبير جداً، الحد الأقصى المسموح به هو 2 ميجابايت.', 'The image is too large. Maximum size is 2 MB.'));
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
      role: 'OPERATIONS_MANAGER',
      isActive: true,
      companyIds: [formData.id],
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

  const handleSaveUserSubmit = (e: React.FormEvent) => {
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

    // Check duplicate username
    const duplicate = users.find(u => u.username.toLowerCase() === userFormData.username?.trim().toLowerCase() && u.id !== editingUser?.id);
    if (duplicate) {
      setUserFormError(tr('اسم المستخدم هذا مسجل مسبقاً في النظام، يرجى اختيار اسم مستخدم آخر', 'This username already exists. Choose another username.'));
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
        role: userFormData.role || 'OPERATIONS_MANAGER',
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
      alert(tr('يرجى إدخال اسم القسم بالعربية', 'Enter the department name in Arabic.'));
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
      if (!confirm(tr(`يوجد ${assignedCount} موظفاً مرتبطين بهذا القسم (${dept.nameAr}). هل أنت متأكد من حذف القسم من ملف المنشأة؟`, `${assignedCount} employees are assigned to this department (${dept.nameEn || dept.nameAr}). Delete it from the Company Profile?`))) {
        return;
      }
    } else {
      if (!confirm(tr(`هل أنت متأكد من حذف القسم (${dept.nameAr})؟`, `Delete department (${dept.nameEn || dept.nameAr})?`))) return;
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
      alert(tr('يرجى إدخال رمز واسم مركز التكلفة', 'Enter the cost center code and name.'));
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
      if (!confirm(tr(`يوجد ${assignedCount} موظفاً مسجلين على مركز التكلفة (${cc.nameAr}). هل تريد بالتأكيد حذفه؟`, `${assignedCount} employees are assigned to cost center (${cc.nameEn || cc.nameAr}). Delete it?`))) {
        return;
      }
    } else {
      if (!confirm(tr(`هل أنت متأكد من حذف مركز التكلفة (${cc.nameAr})؟`, `Delete cost center (${cc.nameEn || cc.nameAr})?`))) return;
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
    <div data-no-translate className="space-y-6">
      
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
                title={tr('تغيير الشعار', 'Change logo')}
              >
                <Upload className="w-4 h-4 mb-0.5" />
                <span>{tr('تغيير', 'Change')}</span>
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
                  {(language === 'ar' ? formData.nameAr : (formData.nameEn || formData.nameAr)) || tr('ملف المنشأة', 'Company Profile')}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-mono font-bold">
                  {tr('كود', 'Code')}: {formData.companyCode}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                  {tr('سجل تجاري', 'CR')}: {formData.crNumber}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                {language === 'ar' ? (formData.nameEn || 'Company Profile & Organizational Structure') : formData.nameAr} | {companyEmployees.length} {tr('موظف مسجل', 'registered employees')} | {companyUsers.length} {tr('مستخدم مفوض', 'authorized users')}
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
              <span>{tr('حفظ تعديلات المنشأة', 'Save company changes')}</span>
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

        <CompanyProfileTabs
          activeTab={activeSubTab}
          currentUser={currentUser}
          userCount={companyUsers.length}
          departmentCount={departmentsList.length}
          costCenterCount={formData.costCenters?.length || 0}
          onChange={setActiveSubTab}
          tr={tr}
        />
      </div>

      {/* SUB-TAB 1: Basic & Government Details */}
      {activeSubTab === 'details' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{tr('بيانات التسجيل الحكومي والمنشأة', 'Company and government registration')}</h3>
              <p className="text-xs text-slate-500">{tr('تعديل بيانات السجل التجاري، الرقم الضريبي، واشتراك التأمينات الاجتماعية', 'Manage commercial registration, VAT and GOSI registration details')}</p>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              {tr('متوافق مع وزارة الموارد البشرية وهيئة الزكاة والضريبة والجمارك (ZATCA)', 'MHRSD and ZATCA compliant')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Arabic Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('اسم المنشأة الرسمي بالعربية *', 'Official company name in Arabic *')}</label>
              <input
                type="text"
                required
                value={formData.nameAr}
                onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 font-semibold text-slate-900"
                placeholder={tr('مثال: شركة التقنية المتقدمة المحدودة', 'Example: شركة التقنية المتقدمة المحدودة')}
              />
            </div>

            {/* English Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('اسم المنشأة بالإنجليزية (English Name)', 'Company name in English')}</label>
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
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('رمز المنشأة الداخلي (Company Code) *', 'Internal company code *')}</label>
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
                <label className="block text-xs font-bold text-slate-700">{tr('رقم السجل التجاري (C.R. Number) *', 'Commercial registration number *')}</label>
                {formData.crNumber && (
                  validateSaudiCR(formData.crNumber) ? (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> {tr('سجل صحيح (10 أرقام)', 'Valid CR (10 digits)')}
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5">
                      <AlertCircle className="w-3 h-3" /> {tr('10 أرقام', '10 digits')}
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
                <label className="block text-xs font-bold text-slate-700">{tr('الرقم الضريبي (VAT / Tax No) *', 'VAT number *')}</label>
                {formData.taxNumber && (
                  validateSaudiTaxNumber(formData.taxNumber) ? (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> {tr('رقم ضريبي صحيح', 'Valid VAT number')}
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5">
                      <AlertCircle className="w-3 h-3" /> {tr('15 رقماً يبدأ وينتهي بـ 3', '15 digits, starting and ending with 3')}
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
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('رقم اشتراك التأمينات الاجتماعية (GOSI No) *', 'GOSI establishment number *')}</label>
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
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('العملة الأساسية', 'Base currency')}</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold text-slate-900"
              >
                <option value="SAR">{tr('ريال سعودي (SR)', 'Saudi Riyal (SR)')}</option>
                <option value="USD">{tr('دولار أمريكي (USD - $)', 'US Dollar (USD)')}</option>
                <option value="AED">{tr('درهم إماراتي (AED)', 'UAE Dirham (AED)')}</option>
              </select>
            </div>

            {/* Timezone */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('المنطقة الزمنية', 'Time zone')}</label>
              <input
                type="text"
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono text-slate-900"
              />
            </div>

            {/* Fiscal Year Start */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('شهر بداية السنة المالية', 'Fiscal year starting month')}</label>
              <select
                value={formData.fiscalYearStartMonth}
                onChange={(e) => setFormData({ ...formData, fiscalYearStartMonth: parseInt(e.target.value, 10) || 1 })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold text-slate-900"
              >
                <option value={1}>{tr('يناير', 'January')} (01)</option>
                <option value={4}>{tr('أبريل', 'April')} (04)</option>
                <option value={7}>{tr('يوليو', 'July')} (07)</option>
                <option value={10}>{tr('أكتوبر', 'October')} (10)</option>
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
                <h4 className="text-xs font-bold text-slate-800">{tr('شعار المنشأة المعتمد (Company Logo)', 'Approved company logo')}</h4>
                <p className="text-[11px] text-slate-500">{tr('يظهر في التقارير الرسمية، قسائم الرواتب، وكشوفات حماية الأجور', 'Displayed on official reports, payslips and WPS files')}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{tr('رفع شعار جديد', 'Upload new logo')}</span>
              </button>
              {formData.logo && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, logo: undefined })}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{tr('إزالة', 'Remove')}</span>
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
              <span>{tr('حفظ البيانات الأساسية', 'Save basic details')}</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: Banking & WPS Details */}
      {activeSubTab === 'banking' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{tr('الحساب البنكي وبيانات نظام حماية الأجور (WPS)', 'Bank account and Wage Protection System (WPS)')}</h3>
              <p className="text-xs text-slate-500">{tr('الحساب البنكي المعتمد لصرف رواتب المنشأة ورموز السويفت (SWIFT/BIC)', 'Approved payroll account and SWIFT/BIC settings')}</p>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              {tr('معتمد من البنك المركزي السعودي (SAMA)', 'SAMA compliant')}
            </span>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 overflow-hidden">
            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-200">
              <div><h4 className="text-sm font-black text-slate-900">{tr('تعريفات البنوك وSWIFT للموظفين', 'Employee bank and SWIFT definitions')}</h4><p className="text-[11px] text-slate-600 mt-1">{tr('يُحدد البنك تلقائيًا من الرقمين الخامس والسادس في IBAN ويُطبّق SWIFT هنا على كل موظفي البنك.', 'The bank is detected from IBAN digits 5–6, and its SWIFT code is applied to every employee using that bank.')}</p></div>
              <button type="button" onClick={() => setFormData({ ...formData, bankDefinitions: [...(formData.bankDefinitions || []), { ibanBankCode: '', nameAr: '', nameEn: '', swiftCode: '', isActive: true }] })} className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> {tr('إضافة بنك', 'Add bank')}</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="bg-white/80 text-slate-600"><tr><th className="p-2 text-start">{tr('كود IBAN', 'IBAN code')}</th><th className="p-2 text-start">{tr('اسم البنك بالعربي', 'Arabic bank name')}</th><th className="p-2 text-start">{tr('الاسم بالإنجليزي', 'English name')}</th><th className="p-2 text-start">SWIFT / BIC</th><th className="p-2 text-center">{tr('نشط', 'Active')}</th><th className="p-2"></th></tr></thead>
                <tbody className="divide-y divide-emerald-100">
                  {(formData.bankDefinitions || []).map((bank, index) => {
                    const updateBank = (changes: Partial<CompanyBankDefinition>) => setFormData({ ...formData, bankDefinitions: (formData.bankDefinitions || []).map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) });
                    return <tr key={`${bank.ibanBankCode}-${index}`} className="bg-white/60">
                      <td className="p-2"><input value={bank.ibanBankCode} onChange={event => updateBank({ ibanBankCode: event.target.value.replace(/\D/g, '').slice(0, 2) })} className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg font-mono text-center" placeholder="80" /></td>
                      <td className="p-2"><input value={bank.nameAr} onChange={event => updateBank({ nameAr: event.target.value })} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg" /></td>
                      <td className="p-2"><input value={bank.nameEn} onChange={event => updateBank({ nameEn: event.target.value })} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg" dir="ltr" /></td>
                      <td className="p-2"><input value={bank.swiftCode} onChange={event => updateBank({ swiftCode: event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 11) })} className="w-36 px-2 py-1.5 border border-slate-200 rounded-lg font-mono" dir="ltr" /></td>
                      <td className="p-2 text-center"><input type="checkbox" checked={bank.isActive !== false} onChange={event => updateBank({ isActive: event.target.checked })} className="accent-emerald-600" /></td>
                      <td className="p-2 text-center"><button type="button" onClick={() => setFormData({ ...formData, bankDefinitions: (formData.bankDefinitions || []).filter((_, itemIndex) => itemIndex !== index) })} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title={tr('حذف تعريف البنك', 'Delete bank definition')}><Trash2 className="w-4 h-4" /></button></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Bank Name */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">{tr('بنك صرف الرواتب للمنشأة *', 'Company payroll bank *')}</label>
                <span className="text-[10px] text-slate-400">{tr('قائمة البنوك السعودية', 'Saudi banks')}</span>
              </div>
              <select
                value={formData.bankCode || detectBankFromIBAN(formData.bankIban || '', formData.bankDefinitions)?.code || getBankDefinitions(formData.bankDefinitions).find(bank => bank.nameAr === formData.bankName || bank.nameEn === formData.bankName)?.ibanBankCode || ''}
                onChange={(e) => {
                  const selectedBank = getBankDefinitions(formData.bankDefinitions).find(bank => bank.ibanBankCode === e.target.value);
                  setFormData({ 
                    ...formData, 
                    bankCode: selectedBank?.ibanBankCode || '',
                    bankName: selectedBank?.nameAr || '',
                    bankSwiftCode: selectedBank?.swiftCode || formData.bankSwiftCode || ''
                  });
                }}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 font-semibold text-slate-900"
              >
                <option value="">{tr('-- اختر البنك --', '-- Select bank --')}</option>
                {getBankDefinitions(formData.bankDefinitions).filter(b => b.isActive !== false).map(b => (
                  <option key={b.ibanBankCode} value={b.ibanBankCode}>
                    {language === 'en' ? b.nameEn || b.nameAr : b.nameAr} ({b.swiftCode})
                  </option>
                ))}
              </select>
            </div>

            {/* IBAN */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">{tr('رقم الآيبان البنكي للمنشأة (IBAN) *', 'Company IBAN *')}</label>
                {formData.bankIban && (
                  validateSaudiIBAN(formData.bankIban) ? (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> {tr('آيبان صحيح', 'Valid IBAN')}
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5">
                      <AlertCircle className="w-3 h-3" /> {tr('24 خانة تبدأ بـ SA', '24 characters starting with SA')}
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
                  const detected = detectBankFromIBAN(cleanIban, formData.bankDefinitions);
                  setFormData({ 
                    ...formData, 
                    bankIban: cleanIban,
                    bankCode: detected?.code || formData.bankCode,
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
                <label className="block text-xs font-bold text-slate-700">{tr('رمز السويفت (SWIFT / BIC Code)', 'SWIFT / BIC code')}</label>
                <button
                  type="button"
                  onClick={() => {
                    let code = '';
                    if (formData.bankIban) {
                      const det = detectBankFromIBAN(formData.bankIban, formData.bankDefinitions);
                      if (det) code = det.swiftCode;
                    }
                    if (!code && formData.bankName) {
                      code = getSwiftCodeFromBankName(formData.bankName, formData.bankDefinitions);
                    }
                    if (code) {
                      setFormData({ ...formData, bankSwiftCode: code });
                    } else {
                      alert(tr('يرجى تحديد البنك أو إدخال رقم الآيبان لتوليد رمز السويفت', 'Select a bank or enter an IBAN to generate the SWIFT code.'));
                    }
                  }}
                  className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 cursor-pointer"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>{tr('توليد تلقائي', 'Auto-generate')}</span>
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
                      <CheckCircle2 className="w-2.5 h-2.5" /> {tr('معتمد قياسياً (ISO 9362)', 'Valid ISO 9362 code')}
                    </span>
                  ) : (
                    <span className="text-amber-600 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-2.5 h-2.5" /> {tr('التنسيق القياسي: 8 إلى 11 حرفاً', 'Standard format: 8–11 characters')}
                    </span>
                  )
                ) : (
                  <span className="text-slate-400">{tr('يتولد تلقائياً من رقم الآيبان', 'Generated automatically from the IBAN')}</span>
                )}
                <span className="text-slate-400 font-mono">{(formData.bankSwiftCode || '').length}/11</span>
              </div>
            </div>

            {[
              ['bankCustomerCode', tr('اسم العميل / كود العميل لدى البنك', 'Bank customer name / code'), tr('مثال: P0030694', 'Example: P0030694')],
              ['bankAgreementCode', tr('رمز اتفاقية الرواتب', 'Payroll agreement code'), tr('مثال: P0030694', 'Example: P0030694')],
              ['bankFundingAccount', tr('حساب التمويل', 'Funding account'), tr('رقم حساب تمويل الرواتب', 'Payroll funding account number')],
              ['bankBranchCode', tr('رقم فرع البنك', 'Bank branch number'), tr('مثال: 326', 'Example: 326')],
              ['laborOfficeEstablishmentNo', tr('رقم المنشأة في مكتب العمل', 'Labor Office establishment number'), tr('مثال: 4-2005115', 'Example: 4-2005115')],
              ['chamberOfCommerceNo', tr('رقم المنشأة في الغرفة التجارية', 'Chamber of Commerce number'), tr('رقم العضوية/المنشأة', 'Membership / establishment number')],
              ['bankPayrollCode', tr('رمز البنك المختصر في ملف الرواتب', 'Payroll file bank code'), tr('مثال: RIBL', 'Example: RIBL')],
            ].map(([field, label, placeholder]) => (
              <div key={field}>
                <label className="block text-xs font-bold text-slate-700 mb-1">{label}</label>
                <input
                  type="text"
                  value={(formData[field as keyof Company] as string) || ''}
                  onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono"
                  placeholder={placeholder}
                  dir="ltr"
                />
              </div>
            ))}

            {/* Payroll Cut-off Day */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('يوم إقفال مسير الرواتب الشهري (Cut-off Day)', 'Monthly payroll cut-off day')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={formData.payrollCutoffDay}
                  onChange={(e) => setFormData({ ...formData, payrollCutoffDay: parseInt(e.target.value, 10) || 25 })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                />
                <span className="text-xs text-slate-500 font-medium whitespace-nowrap">{tr('من كل شهر ميلادي', 'of each month')}</span>
              </div>
            </div>

            {/* Payroll Payment Day */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('يوم تحويل وصرف الرواتب (Payment Day)', 'Payroll payment day')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={formData.payrollPaymentDay}
                  onChange={(e) => setFormData({ ...formData, payrollPaymentDay: parseInt(e.target.value, 10) || 27 })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
                />
                <span className="text-xs text-slate-500 font-medium whitespace-nowrap">{tr('من كل شهر ميلادي', 'of each month')}</span>
              </div>
            </div>

            {/* Work days per month */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('أيام العمل المعيارية شهرياً لحساب أجر اليوم', 'Standard monthly workdays for daily-rate calculation')}</label>
              <select
                value={formData.workDaysPerMonth}
                onChange={(e) => setFormData({ ...formData, workDaysPerMonth: parseInt(e.target.value, 10) || 30 })}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold text-slate-900"
              >
                <option value={30}>{tr('30 يوماً (المعيار الشائع لنظام العمل السعودي)', '30 days (common Saudi Labor Law basis)')}</option>
                <option value={26}>{tr('26 يوماً (خصم يوم الراحة الأسبوعية)', '26 days (excluding weekly rest days)')}</option>
                <option value={22}>{tr('22 يوماً (الدوام 5 أيام أسبوعياً)', '22 days (five-day workweek)')}</option>
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
              <span>{tr('حفظ الإعدادات البنكية ومسيرات الرواتب', 'Save banking and payroll settings')}</span>
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
          setSaveSuccessMessage(tr('تم حفظ إعدادات وتكوين الربط مع قيود (Qoyod API 2.0) بنجاح', 'Qoyod API 2.0 integration settings were saved successfully.'));
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
                message: tr(`صيغة مفتاح API-KEY والإعدادات مكتملة لمنشأة: ${formData.nameAr}. استخدم الترحيل التجريبي للتحقق الفعلي من الخادم.`, `The API key format and settings are complete for ${formData.nameEn || formData.nameAr}. Use the test journal action to verify the server connection.`),
              });
              const updatedConfig = { ...qConfig, lastTestStatus: 'SUCCESS' as const, lastTestMessage: tr('الإعدادات مكتملة', 'Settings complete') };
              setQConfig(updatedConfig);
              if (onSaveQoyodConfig) onSaveQoyodConfig(updatedConfig);
            } else {
              setQoyodTestResult({
                status: 'FAILED',
                message: tr('يرجى إدخال مفتاح API-KEY الصحيح المستخرج من لوحة تحكم قيود (الإعدادات > مفاتيح الـ API)', 'Enter a valid API-KEY from Qoyod Dashboard > Settings > API Keys.'),
              });
            }
          }, 600);
        };

        const handleDirectSync = async () => {
          if ((!qConfig.apiKey || qConfig.apiKey.trim().length < 5) && !qConfig.apiKeyConfigured) {
            alert(tr('يرجى حفظ وإدخال مفتاح API-KEY أولاً', 'Enter and save the API-KEY first.'));
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
            alert(`${tr('خطأ أثناء الاتصال بخادم قيود', 'Error connecting to Qoyod')}: ${err.message || err}`);
          }
        };

        return (
          <div data-no-translate className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
            
            {/* Header Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-200 shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      {tr('تكامل نظام قيود المحاسبي (Qoyod API 2.0)', 'Qoyod Accounting Integration (API 2.0)')}
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 font-mono text-[10px] font-bold">
                      POST /2.0/journal_entries
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {tr('الربط الآلي المباشر لترحيل قيود الرواتب والبدلات والاستقطاعات لشجرة حسابات قيود لمنشأة', 'Direct integration for posting payroll, allowances and deductions to Qoyod for')} {language === 'ar' ? formData.nameAr : (formData.nameEn || formData.nameAr)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onOpenQo…4206 tokens truncated…role] || ROLE_INFO.OPERATIONS_MANAGER;
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
      )}

      {/* SUB-TAB 4: Departments Management */}
      {activeSubTab === 'departments' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{tr('الهيكل الإداري والأقسام لمنشأة', 'Departments and organizational structure for')} {language === 'ar' ? formData.nameAr : (formData.nameEn || formData.nameAr)}</h3>
              <p className="text-xs text-slate-500">{tr('إضافة وتعديل الأقسام وتعيين مدراء الإدارات وربط الموظفين', 'Add and edit departments, assign department heads, and view linked employees')}</p>
            </div>
            <button
              type="button"
              onClick={handleOpenAddDept}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm self-start"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('إضافة قسم جديد', 'Add department')}</span>
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
                      <h4 className="text-sm font-bold text-slate-900 mt-1">{language === 'ar' ? dept.nameAr : (dept.nameEn || dept.nameAr)}</h4>
                      {(language === 'ar' ? dept.nameEn : dept.nameAr) && <p className="text-[11px] text-slate-400 font-medium" dir={language === 'ar' ? 'ltr' : 'rtl'}>{language === 'ar' ? dept.nameEn : dept.nameAr}</p>}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditDept(dept)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                        title={tr('تعديل القسم', 'Edit department')}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDept(dept)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                        title={tr('حذف القسم', 'Delete department')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 line-clamp-2 mb-3 min-h-[32px]">
                    {dept.description || tr('لا يوجد وصف إضافي للقسم', 'No department description')}
                  </p>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="text-slate-600">
                      <span className="text-[11px] text-slate-400 block">{tr('مدير / رئيس القسم:', 'Department head:')}</span>
                      <span className="font-bold text-[11px] text-slate-800">{dept.headName || tr('غير محدد', 'Not assigned')}</span>
                    </div>

                    <div className="text-left">
                      <span className="text-[11px] text-slate-400 block">{tr('الموظفين:', 'Employees:')}</span>
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md text-[11px]">
                        <Users className="w-3 h-3" />
                        {assignedEmployees.length} {tr('موظف', 'employees')}
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
              <h3 className="text-sm font-bold text-slate-900">{tr('مراكز التكلفة المحاسبية (Cost Centers)', 'Accounting Cost Centers')}</h3>
              <p className="text-xs text-slate-500">{tr('توزيع مصاريف الرواتب والمخصصات على مراكز التكلفة المختلفة لترحيل القيود بدقة', 'Allocate payroll expenses and provisions to cost centers for accurate journal posting')}</p>
            </div>
            <button
              type="button"
              onClick={handleOpenAddCostCenter}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm self-start"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('إضافة مركز تكلفة جديد', 'Add cost center')}</span>
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
                      <h4 className="text-sm font-bold text-slate-900 mt-1">{language === 'ar' ? cc.nameAr : (cc.nameEn || cc.nameAr)}</h4>
                      {(language === 'ar' ? cc.nameEn : cc.nameAr) && <p className="text-[11px] text-slate-400 font-medium" dir={language === 'ar' ? 'ltr' : 'rtl'}>{language === 'ar' ? cc.nameEn : cc.nameAr}</p>}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditCostCenter(cc)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                        title={tr('تعديل مركز التكلفة', 'Edit cost center')}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCostCenter(cc)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                        title={tr('حذف مركز التكلفة', 'Delete cost center')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-400">{tr('الموظفين المنسوبين للمركز:', 'Employees assigned to center:')}</span>
                    <span className="font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg text-[11px]">
                      {assignedEmpCount} {tr('موظف', 'employees')}
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
              <h3 className="text-sm font-bold text-slate-900">{tr('قواعد احتساب الرواتب ونسب التأمينات الاجتماعية (GOSI)', 'Payroll Calculation Rules and GOSI Rates')}</h3>
              <p className="text-xs text-slate-500">{tr('ضبط معادلات الخصومات، البدلات، الإضافي، وسقف اشتراك التأمينات للمواطنين والمقيمين', 'Configure deductions, allowances, overtime and GOSI contribution limits')}</p>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              {tr('متوافق مع التعديلات المعتمدة للمؤسسة العامة للتأمينات الاجتماعية', 'Supports current GOSI contribution settings')}
            </span>
          </div>

          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] items-center gap-4">
              <div>
                <h4 className="text-sm font-black text-slate-900">{tr('الميزانية الشهرية المتوقعة للرواتب', 'Expected Monthly Payroll Budget')}</h4>
                <p className="text-[11px] text-slate-600 mt-1">{tr('تُستخدم في لوحة التحكم لمقارنة الميزانية المحددة بالمسير الفعلي لأحدث فترة. اتركها صفراً إذا لم تعتمد ميزانية بعد.', 'Used by the dashboard to compare the configured budget with the latest actual payroll. Leave it at zero if no budget has been approved.')}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{tr('سقف الميزانية الشهرية (SR)', 'Monthly budget limit (SR)')}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.monthlyBudgetCap ?? 0}
                  onChange={(e) => setFormData({ ...formData, monthlyBudgetCap: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-indigo-200 rounded-xl focus:border-indigo-500 font-mono font-bold text-slate-900"
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Daily Rate Formula */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('أساس حساب أجر اليوم والغياب', 'Daily wage and absence calculation basis')}</label>
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
                <option value="BASE_PLUS_FIXED">{tr('الراتب الأساسي + البدلات الثابتة (شائع في نظام العمل)', 'Basic salary + fixed allowances')}</option>
                <option value="BASE_PLUS_HOUSING">{tr('الراتب الأساسي + بدل السكن فقط', 'Basic salary + housing allowance only')}</option>
                <option value="BASE_ONLY">{tr('الراتب الأساسي فقط', 'Basic salary only')}</option>
              </select>
            </div>

            {/* Monthly Working Days */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('أيام العمل الشهرية المعتمدة للحساب', 'Monthly workdays used in calculations')}</label>
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
                <span className="text-xs font-bold text-slate-600">{tr('يوم / شهر', 'days / month')}</span>
              </div>
            </div>

            {/* Daily Working Hours */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('ساعات العمل اليومية الرسمية', 'Official daily working hours')}</label>
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
                <span className="text-xs font-bold text-slate-600">{tr('ساعة / يوم', 'hours / day')}</span>
              </div>
            </div>

            {/* Delay Grace Period */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('فترة السماح للتأخير قبل بدء الخصم', 'Late-arrival grace period before deduction')}</label>
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
                <span className="text-xs font-bold text-slate-600">{tr('دقيقة', 'minutes')}</span>
              </div>
            </div>

            {/* Absence Day Multiplier */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('مضاعف خصم يوم الغياب بدون إذن', 'Unauthorized absence deduction multiplier')}</label>
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
                <span className="text-xs font-bold text-slate-600">{tr('يوم (1x أو 2x)', 'day (1x or 2x)')}</span>
              </div>
            </div>

            {/* Standard Overtime Rate */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('مضاعف العمل الإضافي بالأيام العادية', 'Regular-day overtime multiplier')}</label>
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
                <span className="text-xs font-bold text-slate-600">{tr('ضعف', 'multiplier')} (1.5x)</span>
              </div>
            </div>

            {/* Weekend Overtime Rate */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('مضاعف العمل الإضافي في العطلات والأعياد', 'Weekend and holiday overtime multiplier')}</label>
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
                <span className="text-xs font-bold text-slate-600">{tr('ضعف', 'multiplier')} (2.0x)</span>
              </div>
            </div>

            {/* Saudi Employee GOSI */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('نسبة استقطاع التأمينات من الموظف السعودي', 'Saudi employee GOSI contribution rate')}</label>
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
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('نسبة مساهمة المنشأة في تأمينات الموظف السعودي', 'Saudi employer GOSI contribution rate')}</label>
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
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('الحد الأقصى للراتب الخاضع للتأمينات (Max Cap)', 'Maximum GOSI contributory salary')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
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
                <span className="text-xs font-bold text-slate-600">SR</span>
              </div>
            </div>

            {/* Non-Saudi Hazard Rate */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('نسبة الأخطار المهنية للموظف غير السعودي', 'Non-Saudi occupational hazards rate')}</label>
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
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('دقة التقريب العشري للمبالغ المالية', 'Financial amount decimal precision')}</label>
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
                <option value="2">{tr('منزلتين عشريتين (هللات - 0.00)', 'Two decimal places (halalas - 0.00)')}</option>
                <option value="0">{tr('أقرب رقم صحيح (بدون كسور)', 'Nearest whole number (no decimals)')}</option>
                <option value="3">{tr('ثلاث منازل عشرية (0.000)', 'Three decimal places (0.000)')}</option>
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
              <span>{tr('حفظ سياسات الرواتب والتأمينات', 'Save payroll and GOSI policies')}</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB 7: Chart of Accounts */}
      {activeSubTab === 'accounts' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{tr('ربط شجرة الحسابات المحاسبية لقيود الرواتب', 'Payroll Chart of Accounts Mapping')}</h3>
              <p className="text-xs text-slate-500">{tr('أرقام الحسابات في النظام المحاسبي (تكامل برنامج قيود والأنظمة المحاسبية)', 'Map payroll accounts for Qoyod and other accounting integrations')}</p>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              {tr('متوافق مع معايير المحاسبة الدولية IFRS', 'IFRS-ready mapping')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries({
              salariesExpenseAccount: tr('حساب مصروف الرواتب الأساسية', 'Basic salaries expense account'),
              housingAllowanceAccount: tr('حساب مصروف بدل السكن', 'Housing allowance expense account'),
              transportAllowanceAccount: tr('حساب مصروف بدل النقل', 'Transport allowance expense account'),
              overtimeExpenseAccount: tr('حساب مصروف العمل الإضافي', 'Overtime expense account'),
              otherAllowancesExpenseAccount: tr('حساب مصروف البدلات الأخرى', 'Other allowances expense account'),
              gosiEmployerExpenseAccount: tr('حساب مصروف مساهمة المنشأة في التأمينات', 'Employer GOSI expense account'),
              salariesPayableAccount: tr('حساب الرواتب المستحقة (التزامات)', 'Salaries payable account'),
              gosiPayableAccount: tr('حساب التأمينات الاجتماعية المستحقة', 'GOSI payable account'),
              employeeAdvancesAccount: tr('حساب سلف الموظفين (أصول متداولة)', 'Employee advances account'),
              penaltiesPayableAccount: tr('حساب الجزاءات والخصومات', 'Penalties and deductions account'),
              bankAccount: tr('حساب البنك / النقدية للصرف', 'Payroll bank / cash account'),
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
              <span>{tr('حفظ دليل الحسابات', 'Save account mapping')}</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB 8: Sensitive Data Management */}
      {activeSubTab === 'danger' && hasPermission(currentUser, 'MANAGE_EMPLOYEES') && (
        <div className="bg-white rounded-2xl p-6 border border-rose-200 shadow-sm space-y-5">
          <div className="flex items-start gap-3 border-b border-rose-100 pb-4">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-rose-900">{tr('منطقة الخطر وإدارة البيانات الحساسة', 'Danger Zone and Sensitive Data')}</h3>
              <p className="text-xs text-rose-700 mt-1">{tr('العمليات في هذا القسم نهائية وتؤثر على بيانات المنشأة الحالية فقط.', 'Actions in this section are permanent and affect the current company only.')}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h4 className="text-sm font-black text-slate-900">{tr('مسح جميع موظفي المنشأة', 'Delete All Company Employees')}</h4>
              <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-6">
                {tr(`سيتم حذف ${companyEmployees.length} موظفًا من منشأة ${formData.nameAr}، مع سجلات الحضور والإجازات والسلف والجزاءات ومسيرات الرواتب والقيود المرتبطة بهم. لن تُحذف المنشأة أو إعداداتها أو حساب المدير.`, `${companyEmployees.length} employees and their attendance, leave, loans, penalties, payroll and journal records will be deleted from ${formData.nameEn || formData.nameAr}. The company, settings and administrator account will remain.`)}
              </p>
            </div>
            <button
              type="button"
              disabled={!companyEmployees.length || !onDeleteAllCompanyEmployees}
              onClick={() => { setDeleteEmployeesConfirmation(''); setIsDeleteEmployeesModalOpen(true); }}
              className="px-5 py-2.5 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Trash2 className="w-4 h-4" />
              {tr('مسح جميع الموظفين', 'Delete all employees')} ({companyEmployees.length})
            </button>
          </div>
        </div>
      )}

      {isDeleteEmployeesModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div data-no-translate className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-rose-200 overflow-hidden">
            <div className="bg-rose-700 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6" />
                <div>
                  <h3 className="font-black">{tr('تأكيد مسح جميع الموظفين', 'Confirm Employee Deletion')}</h3>
                  <p className="text-xs text-rose-100">{tr('هذه العملية لا يمكن التراجع عنها من داخل النظام', 'This action cannot be undone from within the system')}</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsDeleteEmployeesModalOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-900 leading-6">
                {tr('سيتم حذف', 'This will delete')} <b>{companyEmployees.length} {tr('موظفًا', 'employees')}</b> {tr('وكل معاملاتهم المرتبطة من منشأة', 'and all linked transactions from')} <b>{language === 'ar' ? formData.nameAr : (formData.nameEn || formData.nameAr)}</b>. {tr('تأكد من وجود نسخة احتياطية إذا كانت هناك بيانات مهمة.', 'Ensure a backup exists if the data is important.')}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">{tr('اكتب «حذف جميع الموظفين» للتأكيد:', 'Type “DELETE ALL EMPLOYEES” to confirm:')}</label>
                <input
                  autoFocus
                  value={deleteEmployeesConfirmation}
                  onChange={event => setDeleteEmployeesConfirmation(event.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-bold focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15"
                  placeholder={tr('حذف جميع الموظفين', 'DELETE ALL EMPLOYEES')}
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" onClick={() => setIsDeleteEmployeesModalOpen(false)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold cursor-pointer">{tr('إلغاء', 'Cancel')}</button>
              <button
                type="button"
                disabled={!deleteEmployeesConfirmationValid}
                onClick={() => {
                  if (!deleteEmployeesConfirmationValid) return;
                  onDeleteAllCompanyEmployees?.(formData.id);
                  setIsDeleteEmployeesModalOpen(false);
                  setDeleteEmployeesConfirmation('');
                  setSaveSuccessMessage(tr(`تم مسح جميع موظفي المنشأة (${companyEmployees.length}) والبيانات المرتبطة بهم`, `All company employees (${companyEmployees.length}) and linked records were deleted.`));
                }}
                className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-black cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {tr('حذف نهائي', 'Delete permanently')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* USER MODAL */}
      {/* ========================================================================= */}
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
                  <p className="text-xs text-slate-500">{tr('منشأة', 'Company')}: {language === 'ar' ? formData.nameAr : (formData.nameEn || formData.nameAr)}</p>
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
                    {Object.entries(ROLE_INFO).filter(([key]) => key !== 'ADMIN' && (activeRole === 'ADMIN' || key === 'OPERATIONS_MANAGER')).map(([key, info]) => (
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

      {/* ========================================================================= */}
      {/* DEPARTMENT MODAL */}
      {/* ========================================================================= */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div data-no-translate className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                  <FolderTree className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingDept ? tr('تعديل بيانات القسم', 'Edit Department') : tr('إضافة قسم إداري جديد', 'Add Department')}
                  </h3>
                  <p className="text-xs text-slate-500">{tr('منشأة', 'Company')}: {language === 'ar' ? formData.nameAr : (formData.nameEn || formData.nameAr)}</p>
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
                <label className="block text-xs font-bold text-slate-700 mb-1">{tr('رمز القسم (Code) *', 'Department code *')}</label>
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
                <label className="block text-xs font-bold text-slate-700 mb-1">{tr('اسم القسم بالعربية *', 'Department name in Arabic *')}</label>
                <input
                  type="text"
                  required
                  value={deptFormData.nameAr || ''}
                  onChange={(e) => setDeptFormData({ ...deptFormData, nameAr: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold"
                  placeholder={tr('تقنية المعلومات والتطوير', 'تقنية المعلومات والتطوير')}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{tr('اسم القسم بالإنجليزية', 'Department name in English')}</label>
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
                <label className="block text-xs font-bold text-slate-700 mb-1">{tr('اسم مدير / رئيس القسم', 'Department head name')}</label>
                <input
                  type="text"
                  value={deptFormData.headName || ''}
                  onChange={(e) => setDeptFormData({ ...deptFormData, headName: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                  placeholder={tr('المهندس / خالد أحمد', 'Department head')}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{tr('وصف واختصاصات القسم', 'Department description and responsibilities')}</label>
                <textarea
                  rows={2}
                  value={deptFormData.description || ''}
                  onChange={(e) => setDeptFormData({ ...deptFormData, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white resize-none"
                  placeholder={tr('مهام ومسؤوليات هذا القسم...', 'Department duties and responsibilities...')}
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsDeptModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {tr('إلغاء', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                >
                  {editingDept ? tr('حفظ التعديلات', 'Save changes') : tr('إضافة القسم', 'Add department')}
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
          <div data-no-translate className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingCostCenter ? tr('تعديل مركز التكلفة', 'Edit Cost Center') : tr('إضافة مركز تكلفة جديد', 'Add Cost Center')}
                  </h3>
                  <p className="text-xs text-slate-500">{tr('منشأة', 'Company')}: {language === 'ar' ? formData.nameAr : (formData.nameEn || formData.nameAr)}</p>
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
                <label className="block text-xs font-bold text-slate-700 mb-1">{tr('رمز مركز التكلفة (Code) *', 'Cost center code *')}</label>
                <input
                  type="text"
                  required
                  value={costCenterFormData.code || ''}
                  onChange={(e) => setCostCenterFormData({ ...costCenterFormData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold"
                  placeholder="CC-100 / CC-SALES"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{tr('اسم مركز التكلفة بالعربية *', 'Cost center name in Arabic *')}</label>
                <input
                  type="text"
                  required
                  value={costCenterFormData.nameAr || ''}
                  onChange={(e) => setCostCenterFormData({ ...costCenterFormData, nameAr: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold"
                  placeholder={tr('المبيعات والتسويق', 'المبيعات والتسويق')}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{tr('الاسم بالإنجليزية', 'Name in English')}</label>
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
                  {tr('إلغاء', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                >
                  {editingCostCenter ? tr('حفظ التعديلات', 'Save changes') : tr('إضافة المركز', 'Add cost center')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
