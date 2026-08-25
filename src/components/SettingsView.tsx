import React, { useState, useRef } from 'react';
import { 
  Building2, 
  Plus, 
  Edit3, 
  Users, 
  Search, 
  UserPlus, 
  CheckCircle2, 
  CreditCard, 
  Trash2, 
  X, 
  Save, 
  KeyRound,
  Shield,
  ShieldCheck,
  Lock,
  Mail,
  Phone,
  User,
  Eye,
  EyeOff,
  Briefcase,
  AlertCircle,
  Hash,
  Sparkles,
  ExternalLink,
  Upload,
  Image as ImageIcon,
  RotateCcw
} from 'lucide-react';
import { Company, Employee, UserRole, UserAccount, CostCenter } from '../types';
import { isStrongPassword, passwordPolicyMessage } from '../utils/passwordPolicy';
import { formatSAR } from '../utils/payrollEngine';
import { 
  validateSaudiIBAN, 
  validateSwiftCode, 
  detectBankFromIBAN, 
  getSwiftCodeFromBankName, 
  getBankDefinitions
} from '../utils/security';
import { useLanguage } from '../i18n/LanguageContext';

interface SettingsViewProps {
  companies: Company[];
  activeCompany: Company;
  employees: Employee[];
  users: UserAccount[];
  activeRole: UserRole;
  currentUser?: UserAccount | null;
  onUpdateCompany: (company: Company) => void;
  onAddCompany: (company: Company) => void;
  onDeleteCompany?: (companyId: string) => void;
  onSaveUser?: (user: UserAccount) => void;
  onDeleteUser?: (userId: string) => void;
  onSelectCompany?: (companyId: string) => void;
}

const ROLE_INFO: Record<UserRole, { labelAr: string; descAr: string; color: string; badgeBg: string }> = {
  ADMIN: {
    labelAr: 'مسؤول النظام (Admin)',
    descAr: 'صلاحيات كاملة وغير مقيدة في إدارة النظام، المستخدمين، والشركات',
    color: 'text-purple-700',
    badgeBg: 'bg-purple-50 border-purple-200 text-purple-700',
  },
  COMPANY_MANAGER: {
    labelAr: 'المدير العام',
    descAr: 'إدارة تشغيلية ومالية دون صلاحية إضافة أو حذف الشركات',
    color: 'text-indigo-700',
    badgeBg: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  },
  OPERATIONS_MANAGER: {
    labelAr: 'مدير العمليات',
    descAr: 'إدارة الموظفين والرواتب والإجازات والسلف والخصومات وأوامر الدفع دون الاعتماد',
    color: 'text-emerald-700',
    badgeBg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  },
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  companies,
  activeCompany,
  employees,
  users = [],
  activeRole,
  currentUser,
  onUpdateCompany,
  onAddCompany,
  onDeleteCompany,
  onSaveUser,
  onDeleteUser,
  onSelectCompany,
}) => {
  const { language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [targetCompanyForUser, setTargetCompanyForUser] = useState<Company | null>(null);

  const [isCompanyUsersModalOpen, setIsCompanyUsersModalOpen] = useState(false);
  const [selectedCompanyForUsers, setSelectedCompanyForUsers] = useState<Company | null>(null);

  // Form State for Company
  const [companyForm, setCompanyForm] = useState<Partial<Company>>({
    companyCode: '103',
    nameAr: '',
    nameEn: '',
    crNumber: '',
    taxNumber: '',
    gosiEstablishmentNo: '',
    bankName: 'مصرف الراجحي',
    bankIban: 'SA',
    currency: 'SAR',
    timezone: 'Asia/Riyadh',
    fiscalYearStartMonth: 1,
    payrollCutoffDay: 25,
    payrollPaymentDay: 27,
    workDaysPerMonth: 30,
    dailyWorkHours: 8,
    costCenters: [
      { id: 'cc-1', code: 'CC-GEN', nameAr: 'الإدارة العامة والموارد البشرية', nameEn: 'General & HR' },
      { id: 'cc-2', code: 'CC-OPS', nameAr: 'العمليات والتشغيل', nameEn: 'Operations' },
    ],
    calculationRules: {
      dailyRateFormula: 'BASE_PLUS_FIXED',
      hourlyRateDivisor: 8,
      delayGracePeriodMinutes: 15,
      delayCalculationMethod: 'EXACT_MINUTES',
      absenceDayMultiplier: 1.0,
      unpaidLeaveMultiplier: 1.0,
      saudiGosiEmployeeRate: 0.0975,
      saudiGosiEmployerRate: 0.1175,
      saudiGosiMaxCap: 45000,
      saudiGosiBaseComponents: ['BASE', 'HOUSING'],
      nonSaudiGosiEmployerHazardRate: 0.02,
      overtimeStandardRate: 1.5,
      overtimeWeekendRate: 2.0,
      roundingDecimals: 2,
    },
    chartOfAccounts: {
      salariesExpenseAccount: '510101',
      housingAllowanceAccount: '510102',
      transportAllowanceAccount: '510103',
      overtimeExpenseAccount: '510104',
      otherAllowancesExpenseAccount: '510105',
      gosiEmployerExpenseAccount: '510106',
      salariesPayableAccount: '210101',
      gosiPayableAccount: '210102',
      employeeAdvancesAccount: '110301',
      penaltiesPayableAccount: '210103',
      bankAccount: '110101',
    }
  });

  // Form State for User
  const [userFormData, setUserFormData] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    phone: '',
    role: 'OPERATIONS_MANAGER' as UserRole,
    employeeId: '',
    companyIds: [] as string[],
    isActive: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Handle Logo Upload
  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      alert('حجم الصورة كبير، يرجى اختيار صورة أقل من 3 ميجابايت لضمان سرعة المعالجة');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setCompanyForm((prev) => ({
          ...prev,
          logo: result,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Filtered Companies
  const filteredCompanies = companies.filter((c) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      (c.companyCode && c.companyCode.toLowerCase().includes(term)) ||
      c.nameAr.toLowerCase().includes(term) ||
      c.nameEn.toLowerCase().includes(term) ||
      c.crNumber.includes(term) ||
      c.taxNumber.includes(term)
    );
  });

  // Open Add Company Modal
  const handleOpenAddCompany = () => {
    const nextCodeNum = 101 + companies.length;
    setEditingCompany(null);
    setCompanyForm({
      companyCode: String(nextCodeNum),
      nameAr: '',
      nameEn: '',
      logo: undefined,
      crNumber: '1010' + Math.floor(100000 + Math.random() * 900000),
      taxNumber: '300' + Math.floor(100000000000 + Math.random() * 900000000000) + '3',
      gosiEstablishmentNo: '9' + Math.floor(10000000 + Math.random() * 90000000),
      bankName: 'مصرف الراجحي',
      bankIban: 'SA' + Math.floor(1000000000000000000000 + Math.random() * 9000000000000000000000),
      currency: 'SAR',
      timezone: 'Asia/Riyadh',
      fiscalYearStartMonth: 1,
      payrollCutoffDay: 25,
      payrollPaymentDay: 27,
      workDaysPerMonth: 30,
      dailyWorkHours: 8,
      costCenters: [
        { id: `cc-${Date.now()}-1`, code: 'CC-ADMIN', nameAr: 'الإدارة العامة', nameEn: 'General Admin' },
        { id: `cc-${Date.now()}-2`, code: 'CC-OPS', nameAr: 'العمليات والتشغيل', nameEn: 'Operations' },
      ],
      calculationRules: {
        dailyRateFormula: 'BASE_PLUS_FIXED',
        hourlyRateDivisor: 8,
        delayGracePeriodMinutes: 15,
        delayCalculationMethod: 'EXACT_MINUTES',
        absenceDayMultiplier: 1.0,
        unpaidLeaveMultiplier: 1.0,
        saudiGosiEmployeeRate: 0.0975,
        saudiGosiEmployerRate: 0.1175,
        saudiGosiMaxCap: 45000,
        saudiGosiBaseComponents: ['BASE', 'HOUSING'],
        nonSaudiGosiEmployerHazardRate: 0.02,
        overtimeStandardRate: 1.5,
        overtimeWeekendRate: 2.0,
        roundingDecimals: 2,
      },
      chartOfAccounts: {
        salariesExpenseAccount: '510101',
        housingAllowanceAccount: '510102',
        transportAllowanceAccount: '510103',
        overtimeExpenseAccount: '510104',
        otherAllowancesExpenseAccount: '510105',
        gosiEmployerExpenseAccount: '510106',
        salariesPayableAccount: '210101',
        gosiPayableAccount: '210102',
        employeeAdvancesAccount: '110301',
        penaltiesPayableAccount: '210103',
        bankAccount: '110101',
      }
    });
    setIsCompanyModalOpen(true);
  };

  // Open Edit Company Modal
  const handleOpenEditCompany = (comp: Company) => {
    setEditingCompany(comp);
    setCompanyForm(JSON.parse(JSON.stringify(comp)));
    setIsCompanyModalOpen(true);
  };

  // Save Company Form
  const handleSaveCompanySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyForm.nameAr || !companyForm.crNumber || !companyForm.companyCode) {
      return;
    }

    if (editingCompany) {
      const updated: Company = {
        ...editingCompany,
        ...companyForm,
      } as Company;
      onUpdateCompany(updated);
    } else {
      const newComp: Company = {
        id: `comp-${Date.now()}`,
        companyCode: companyForm.companyCode || String(101 + companies.length),
        nameAr: companyForm.nameAr || '',
        nameEn: companyForm.nameEn || companyForm.nameAr || '',
        logo: companyForm.logo || undefined,
        crNumber: companyForm.crNumber || '',
        taxNumber: companyForm.taxNumber || '',
        gosiEstablishmentNo: companyForm.gosiEstablishmentNo || '',
        bankName: companyForm.bankName || 'مصرف الراجحي',
        bankIban: companyForm.bankIban || '',
        bankSwiftCode: companyForm.bankSwiftCode || '',
        currency: 'SAR',
        timezone: 'Asia/Riyadh',
        fiscalYearStartMonth: 1,
        payrollCutoffDay: 25,
        payrollPaymentDay: 27,
        workDaysPerMonth: 30,
        dailyWorkHours: 8,
        costCenters: companyForm.costCenters || [],
        calculationRules: companyForm.calculationRules!,
        chartOfAccounts: companyForm.chartOfAccounts!,
      };
      onAddCompany(newComp);
    }

    setIsCompanyModalOpen(false);
  };

  // Open Add User Modal for Specific Company
  const handleOpenAddUserForCompany = (comp: Company) => {
    setTargetCompanyForUser(comp);
    setEditingUser(null);
    setUserFormError(null);
    setUserFormData({
      username: '',
      password: '',
      name: '',
      email: '',
      phone: '',
      role: 'OPERATIONS_MANAGER',
      employeeId: '',
      companyIds: [comp.id],
      isActive: true,
    });
    setIsUserModalOpen(true);
  };

  // Open Edit User Modal
  const handleOpenEditUser = (user: UserAccount, comp?: Company) => {
    if (user.id === 'user-admin') return;
    setTargetCompanyForUser(comp || null);
    setEditingUser(user);
    setUserFormError(null);
    setUserFormData({
      username: user.username,
      password: user.password,
      name: user.name,
      email: user.email || '',
      phone: user.phone || '',
      role: user.role,
      employeeId: user.employeeId || '',
      companyIds: user.companyIds || [],
      isActive: user.isActive,
    });
    setIsUserModalOpen(true);
  };

  // Save User Submit
  const handleSaveUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);

    if (!userFormData.username.trim() || !userFormData.name.trim()) {
      setUserFormError('يرجى ملء اسم المستخدم والاسم الكامل');
      return;
    }
    if ((!editingUser || userFormData.password) && !isStrongPassword(userFormData.password)) {
      setUserFormError(passwordPolicyMessage);
      return;
    }

    // Check duplicate username
    const cleanUsername = userFormData.username.trim().toLowerCase();
    const existing = users.find(
      (u) => u.username.toLowerCase() === cleanUsername && (!editingUser || u.id !== editingUser.id)
    );
    if (existing) {
      setUserFormError(`اسم المستخدم "${userFormData.username}" مسجل مسبقاً، يرجى اختيار اسم مستخدم آخر`);
      return;
    }

    // Ensure companyIds contains the target company or at least one company
    let targetCompanyIds = userFormData.companyIds;
    if (targetCompanyForUser && !targetCompanyIds.includes(targetCompanyForUser.id)) {
      targetCompanyIds = [...targetCompanyIds, targetCompanyForUser.id];
    }
    if (targetCompanyIds.length === 0 && companies.length > 0) {
      targetCompanyIds = [companies[0].id];
    }

    const savedUser: UserAccount = {
      id: editingUser ? editingUser.id : `user-${Date.now()}`,
      username: userFormData.username.trim(),
      password: userFormData.password.trim(),
      name: userFormData.name.trim(),
      email: userFormData.email.trim() || undefined,
      phone: userFormData.phone.trim() || undefined,
      role: userFormData.role,
      employeeId: userFormData.employeeId || undefined,
      companyIds: userFormData.role === 'ADMIN' ? companies.map(c => c.id) : targetCompanyIds,
      isActive: userFormData.isActive,
      createdAt: editingUser ? editingUser.createdAt : new Date().toISOString(),
      lastLogin: editingUser ? editingUser.lastLogin : undefined,
    };

    if (onSaveUser) {
      onSaveUser(savedUser);
    }

    setIsUserModalOpen(false);
  };

  // Open Company Users Modal
  const handleOpenCompanyUsers = (comp: Company) => {
    setSelectedCompanyForUsers(comp);
    setIsCompanyUsersModalOpen(true);
  };

  // Helper to get users assigned to a specific company
  const getUsersByCompany = (comp: Company) => {
    return users.filter(
      (u) => u.role === 'ADMIN' || (u.companyIds && u.companyIds.includes(comp.id))
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-emerald-600" />
            <span>إدارة الشركات ومستخدمي المنشآت</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
              {companies.length} منشآت مسجلة
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            إدارة المنشآت القائمة في النظام، تعديل البيانات الرسمية، وإضافة وتعيين المستخدمين وصلاحيات الدخول لكل شركة
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenAddCompany}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة منشأة / شركة جديدة</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
          <input
            type="text"
            placeholder="بحث برمز الشركة (مثل 101)، اسم المنشأة، السجل التجاري، أو الرقم الضريبي..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
          />
        </div>
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1"
          >
            مسح
          </button>
        )}
      </div>

      {/* Companies List Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredCompanies.map((comp) => {
          const compUsers = getUsersByCompany(comp);
          const compEmployees = employees.filter((e) => e.companyId === comp.id);
          const isCurrentActive = comp.id === activeCompany.id;

          return (
            <div
              key={comp.id}
              className={`bg-white rounded-2xl border transition-all shadow-xs hover:shadow-md flex flex-col justify-between overflow-hidden ${
                isCurrentActive
                  ? 'border-emerald-500 ring-2 ring-emerald-500/10'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Card Header */}
              <div className="p-5 border-b border-slate-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {comp.logo ? (
                      <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 p-1 flex items-center justify-center shadow-xs shrink-0 overflow-hidden">
                        <img 
                          src={comp.logo} 
                          alt={comp.nameAr} 
                          className="w-full h-full object-contain" 
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
                        {comp.companyCode || '101'}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-slate-900">
                          {comp.nameAr}
                        </h2>
                        {isCurrentActive && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                            المنشأة الحالية
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 font-medium">
                        {comp.nameEn}
                      </p>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-mono font-bold border border-slate-200">
                    كود: {comp.companyCode || '101'}
                  </span>
                </div>

                {/* Company Specs Grid */}
                <div className="grid grid-cols-2 gap-2.5 mt-4 text-xs bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-slate-400 text-[11px] block">السجل التجاري (C.R):</span>
                    <span className="font-mono font-bold text-slate-800">{comp.crNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px] block">الرقم الضريبي (VAT):</span>
                    <span className="font-mono font-bold text-slate-800">{comp.taxNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px] block">اشتراك التأمينات (GOSI):</span>
                    <span className="font-mono font-bold text-slate-800">{comp.gosiEstablishmentNo}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px] block">بنك مسير الرواتب:</span>
                    <span className="font-semibold text-slate-800 truncate block">{comp.bankName || 'مصرف الراجحي'}</span>
                  </div>
                </div>

                {/* IBAN & SWIFT */}
                <div className="mt-2 text-xs bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[11px]">الآيبان البنكي:</span>
                    <span className="font-mono font-bold text-slate-700 text-[11px] dir-ltr">{comp.bankIban}</span>
                  </div>
                  {comp.bankSwiftCode && (
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                      <span className="text-slate-400 text-[10px]">رمز السويفت SWIFT/BIC:</span>
                      <span className="font-mono font-bold text-emerald-700 text-[11px] dir-ltr">{comp.bankSwiftCode}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Users & Employees Metrics */}
              <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200/70">
                  <div className="text-[11px] text-slate-500 font-semibold flex items-center justify-center gap-1">
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    <span>المستخدمون المفوّضون</span>
                  </div>
                  <div className="text-base font-black text-slate-800 mt-1">{compUsers.length} مستخدمين</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">صلاحيات إدارة المنشأة</div>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-200/70">
                  <div className="text-[11px] text-slate-500 font-semibold flex items-center justify-center gap-1">
                    <Briefcase className="w-3.5 h-3.5 text-blue-600" />
                    <span>موظفو المنشأة</span>
                  </div>
                  <div className="text-base font-black text-slate-800 mt-1">{compEmployees.length} موظف</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">تُدار بقسم الموظفين الخاص</div>
                </div>
              </div>

              {/* Card Actions Footer */}
              <div className="p-4 bg-white flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenAddUserForCompany(comp)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>إضافة مستخدم</span>
                  </button>

                  <button
                    onClick={() => handleOpenCompanyUsers(comp)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>مستخدمو المنشأة ({compUsers.length})</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenEditCompany(comp)}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                    <span>تعديل</span>
                  </button>

                  {companies.length > 1 && onDeleteCompany && (
                    <button
                      onClick={() => onDeleteCompany(comp.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                      title="حذف المنشأة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL 1: Add/Edit Company Modal */}
      {isCompanyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 sm:p-7 border border-slate-200 animate-in fade-in zoom-in-95 duration-150 my-8">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingCompany ? 'تعديل بيانات المنشأة / الشركة' : 'إضافة شركة أو منشأة جديدة'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    أدخل البيانات القانونية والمالية للمنشأة وكود الدخول
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCompanyModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCompanySubmit} className="space-y-4 text-xs">
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    رمز المنشأة (Company Code) *
                  </label>
                  <input
                    type="text"
                    required
                    value={companyForm.companyCode || ''}
                    onChange={(e) => setCompanyForm({ ...companyForm, companyCode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-emerald-700"
                    placeholder="مثال: 101 أو 102"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">يُستخدم في شاشة تسجيل الدخول</span>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">اسم المنشأة بالعربية *</label>
                  <input
                    type="text"
                    required
                    value={companyForm.nameAr || ''}
                    onChange={(e) => setCompanyForm({ ...companyForm, nameAr: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                    placeholder="مثال: شركة الرؤية للتطوير والاستثمار"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">اسم المنشأة بالإنجليزية</label>
                  <input
                    type="text"
                    value={companyForm.nameEn || ''}
                    onChange={(e) => setCompanyForm({ ...companyForm, nameEn: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                    placeholder="e.g. Al-Roya Development Ltd."
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم السجل التجاري (CR Number) *</label>
                  <input
                    type="text"
                    required
                    value={companyForm.crNumber || ''}
                    onChange={(e) => setCompanyForm({ ...companyForm, crNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                    placeholder="1010XXXXXX"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الرقم الضريبي (VAT) *</label>
                  <input
                    type="text"
                    required
                    value={companyForm.taxNumber || ''}
                    onChange={(e) => setCompanyForm({ ...companyForm, taxNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    placeholder="300XXXXXXXXXXX3"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">اشتراك التأمينات (GOSI Est. No) *</label>
                  <input
                    type="text"
                    required
                    value={companyForm.gosiEstablishmentNo || ''}
                    onChange={(e) => setCompanyForm({ ...companyForm, gosiEstablishmentNo: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    placeholder="900XXXXX"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">بنك صرف الرواتب (حماية الأجور)</label>
                    <span className="text-[10px] text-slate-400">البنوك السعودية المعتمدة</span>
                  </div>
                  <select
                    value={companyForm.bankCode || detectBankFromIBAN(companyForm.bankIban || '', companyForm.bankDefinitions)?.code || getBankDefinitions(companyForm.bankDefinitions).find(bank => bank.nameAr === companyForm.bankName || bank.nameEn === companyForm.bankName)?.ibanBankCode || ''}
                    onChange={(e) => {
                      const selectedBank = getBankDefinitions(companyForm.bankDefinitions).find(bank => bank.ibanBankCode === e.target.value);
                      setCompanyForm({ 
                        ...companyForm, 
                        bankCode: selectedBank?.ibanBankCode || '',
                        bankName: selectedBank?.nameAr || '',
                        bankSwiftCode: selectedBank?.swiftCode || companyForm.bankSwiftCode || ''
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white"
                  >
                    <option value="">-- اختر البنك --</option>
                    {getBankDefinitions(companyForm.bankDefinitions).map(b => (
                      <option key={b.ibanBankCode} value={b.ibanBankCode}>
                        {language === 'en' ? b.nameEn || b.nameAr : b.nameAr} ({b.swiftCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">رقم الآيبان البنكي للمنشأة (IBAN) *</label>
                    {companyForm.bankIban && (
                      validateSaudiIBAN(companyForm.bankIban) ? (
                        <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                          <CheckCircle2 className="w-3 h-3" /> آيبان صحيح
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5">
                          <AlertCircle className="w-3 h-3" /> آيبان غير مكتمل
                        </span>
                      )
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={companyForm.bankIban || ''}
                    onChange={(e) => {
                      const cleanIban = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                      const detected = detectBankFromIBAN(cleanIban);
                      setCompanyForm({ 
                        ...companyForm, 
                        bankIban: cleanIban,
                        bankCode: detected?.code || companyForm.bankCode,
                        bankName: detected ? detected.nameAr : companyForm.bankName,
                        bankSwiftCode: detected ? detected.swiftCode : companyForm.bankSwiftCode
                      });
                    }}
                    className={`w-full px-3 py-2 bg-slate-50 border rounded-xl font-mono ${
                      companyForm.bankIban && validateSaudiIBAN(companyForm.bankIban)
                        ? 'border-emerald-300 focus:border-emerald-500'
                        : 'border-slate-200 focus:border-blue-500'
                    }`}
                    placeholder="SAXXXXXXXXXXXXXXXXXXXXXXXX"
                    dir="ltr"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">رمز السويفت (SWIFT / BIC)</label>
                    <button
                      type="button"
                      onClick={() => {
                        let code = '';
                        if (companyForm.bankIban) {
                          const det = detectBankFromIBAN(companyForm.bankIban);
                          if (det) code = det.swiftCode;
                        }
                        if (!code && companyForm.bankName) {
                          code = getSwiftCodeFromBankName(companyForm.bankName);
                        }
                        if (code) {
                          setCompanyForm({ ...companyForm, bankSwiftCode: code });
                        }
                      }}
                      className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>توليد تلقائي</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={companyForm.bankSwiftCode || ''}
                    onChange={(e) => setCompanyForm({ ...companyForm, bankSwiftCode: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })}
                    className={`w-full px-3 py-2 bg-slate-50 border rounded-xl font-mono uppercase ${
                      companyForm.bankSwiftCode && validateSwiftCode(companyForm.bankSwiftCode)
                        ? 'border-emerald-300 focus:border-emerald-500 text-emerald-900'
                        : 'border-slate-200 focus:border-emerald-500'
                    }`}
                    placeholder="مثال: RJHISARI"
                    dir="ltr"
                    maxLength={11}
                  />
                  {companyForm.bankSwiftCode && (
                    <div className="mt-1 text-[10px]">
                      {validateSwiftCode(companyForm.bankSwiftCode) ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> معتمد قياسياً (ISO 9362)
                        </span>
                      ) : (
                        <span className="text-amber-600 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-2.5 h-2.5" /> التنسيق القياسي: 8 إلى 11 حرفاً ورقم
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Company Logo Customization Section */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-slate-800 text-xs">شعار المنشأة / اللوجو (Company Logo)</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {companyForm.logo ? 'شعار مخصص مفعل' : 'الشعار الافتراضي مفعل'}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-3.5 rounded-xl border border-slate-200">
                  {/* Logo Live Preview */}
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    {companyForm.logo ? (
                      <div className="relative group">
                        <div className="w-16 h-16 rounded-xl bg-white border-2 border-emerald-500/30 p-1 flex items-center justify-center shadow-xs overflow-hidden">
                          <img 
                            src={companyForm.logo} 
                            alt="شعار المنشأة" 
                            className="w-full h-full object-contain" 
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setCompanyForm({ ...companyForm, logo: undefined })}
                          title="حذف الشعار واستعادة الافتراضي"
                          className="absolute -top-1.5 -right-1.5 p-1 bg-rose-500 text-white rounded-full shadow-xs hover:bg-rose-600 transition-all cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-bold text-xl shadow-xs">
                        {companyForm.companyCode || '101'}
                      </div>
                    )}
                    <span className="text-[9px] text-slate-500 font-medium">
                      {companyForm.logo ? 'معاينة الشعار المخصص' : 'الشعار الافتراضي'}
                    </span>
                  </div>

                  {/* Actions & Inputs */}
                  <div className="flex-1 space-y-2 w-full">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input 
                        type="file" 
                        ref={logoInputRef} 
                        onChange={handleLogoFileUpload} 
                        accept="image/png, image/jpeg, image/webp, image/svg+xml" 
                        className="hidden" 
                      />
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>رفع صورة شعار من الجهاز</span>
                      </button>

                      {companyForm.logo && (
                        <button
                          type="button"
                          onClick={() => setCompanyForm({ ...companyForm, logo: undefined })}
                          className="px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>استعادة الشعار الافتراضي</span>
                        </button>
                      )}
                    </div>

                    <div>
                      <input
                        type="text"
                        value={companyForm.logo || ''}
                        onChange={(e) => setCompanyForm({ ...companyForm, logo: e.target.value.trim() || undefined })}
                        placeholder="أو الصق رابط صورة الشعار مباشرة (URL)"
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono focus:bg-white focus:outline-none focus:border-emerald-500"
                        dir="ltr"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">
                      يدعم صيغ الصور (PNG, JPG, SVG, WebP). في حالة عدم الرفع يتم تفعيل الشعار الافتراضي تلقائياً.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCompanyModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingCompany ? 'حفظ التعديلات' : 'إضافة المنشأة'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Add/Edit User for Specific Company Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-7 border border-slate-200 animate-in fade-in zoom-in-95 duration-150 my-8">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    {editingUser ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم جديد للمنشأة'}
                  </h3>
                  {targetCompanyForUser && (
                    <p className="text-xs text-emerald-700 font-semibold mt-0.5">
                      المنشأة: {targetCompanyForUser.nameAr} (كود: {targetCompanyForUser.companyCode || '101'})
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setIsUserModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {userFormError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{userFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveUserSubmit} className="space-y-3.5 text-xs">
              
              {/* Username & Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">اسم المستخدم (Username) *</label>
                  <input
                    type="text"
                    required
                    value={userFormData.username}
                    onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                    placeholder="e.g. hr_user"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">كلمة المرور (Password) *</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={userFormData.password}
                      onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                      placeholder="••••••••"
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
                <label className="block font-bold text-slate-700 mb-1">الاسم الكامل للمستخدم *</label>
                <input
                  type="text"
                  required
                  value={userFormData.name}
                  onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  placeholder="مثال: تركي بن خالد القحطاني"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">الدور والصلاحية (Role) *</label>
                <select
                  value={userFormData.role}
                  onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  {activeRole === 'ADMIN' && <option value="COMPANY_MANAGER">المدير العام</option>}
                  <option value="OPERATIONS_MANAGER">مدير العمليات</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                  {ROLE_INFO[userFormData.role]?.descAr}
                </p>
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    placeholder="user@company.sa"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم الجوال</label>
                  <input
                    type="text"
                    value={userFormData.phone}
                    onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    placeholder="05XXXXXXXX"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Status */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={userFormData.isActive}
                    onChange={(e) => setUserFormData({ ...userFormData, isActive: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500 border-slate-300"
                  />
                  <span className="font-bold text-slate-800">حساب نشط ومفعّل لتسجيل الدخول</span>
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingUser ? 'حفظ التعديلات' : 'إضافة المستخدم'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: View & Manage Company Users Modal */}
      {isCompanyUsersModalOpen && selectedCompanyForUsers && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full p-6 sm:p-7 border border-slate-200 animate-in fade-in zoom-in-95 duration-150 my-8 max-h-[90vh] flex flex-col">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    مستخدمو منشأة: {selectedCompanyForUsers.nameAr}
                  </h3>
                  <p className="text-xs text-slate-500">
                    كود: <span className="font-mono font-bold text-emerald-700">{selectedCompanyForUsers.companyCode || '101'}</span> | حسابات الموظفين المفوّضين بالدخول
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    handleOpenAddUserForCompany(selectedCompanyForUsers);
                  }}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>إضافة مستخدم جديد</span>
                </button>
                <button
                  onClick={() => setIsCompanyUsersModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Users Table */}
            <div className="overflow-y-auto flex-1 border border-slate-200 rounded-2xl">
              {getUsersByCompany(selectedCompanyForUsers).length === 0 ? (
                <div className="p-10 text-center text-slate-400">
                  <Users className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-semibold">لا يوجد مستخدمون مخصصون لهذه المنشأة حالياً</p>
                  <button
                    onClick={() => {
                      handleOpenAddUserForCompany(selectedCompanyForUsers);
                    }}
                    className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>إضافة مستخدم</span>
                  </button>
                </div>
              ) : (
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold sticky top-0">
                    <tr>
                      <th className="py-3 px-4">المستخدم</th>
                      <th className="py-3 px-4">اسم الدخول (Username)</th>
                      <th className="py-3 px-4">الدور / الصلاحية</th>
                      <th className="py-3 px-4">الحالة</th>
                      <th className="py-3 px-4 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {getUsersByCompany(selectedCompanyForUsers).map((u) => {
                      const roleConfig = ROLE_INFO[u.role] || ROLE_INFO.OPERATIONS_MANAGER;

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-800">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                                {u.name ? u.name.charAt(0) : 'U'}
                              </div>
                              <div>
                                <div className="font-bold">{u.name}</div>
                                {u.email && <div className="text-[10px] text-slate-400 font-mono font-normal">{u.email}</div>}
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 font-mono font-bold text-slate-700">
                            {u.username}
                          </td>

                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${roleConfig.badgeBg}`}>
                              <Shield className="w-3 h-3" />
                              <span>{roleConfig.labelAr}</span>
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            {u.isActive ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>نشط</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-slate-400 font-semibold text-[11px]">
                                <X className="w-3.5 h-3.5 text-slate-400" />
                                <span>معطل</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => {
                                  handleOpenEditUser(u, selectedCompanyForUsers);
                                }}
                                className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                title="تعديل المستخدم"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {onDeleteUser && u.id !== 'user-admin' && (
                                <button
                                  onClick={() => onDeleteUser(u.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="حذف المستخدم"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>إجمالي المستخدمين المتاحين لهذه المنشأة: {getUsersByCompany(selectedCompanyForUsers).length}</span>
              <button
                onClick={() => setIsCompanyUsersModalOpen(false)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
