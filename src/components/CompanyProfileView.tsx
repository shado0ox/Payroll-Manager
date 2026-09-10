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
  validateSwiftCode, 
  getBankDefinitions
} from '../utils/security';
import { useLanguage } from '../i18n/LanguageContext';
import { CompanyProfileTabs, type ProfileSubTab } from './company/CompanyProfileTabs';
import { CompanyDetailsTab } from './company/CompanyDetailsTab';
import { CompanyBankingTab } from './company/CompanyBankingTab';
import { CompanyQoyodTab } from './company/CompanyQoyodTab';
import { CompanyUsersTab } from './company/CompanyUsersTab';
import { CompanyDepartmentsTab } from './company/CompanyDepartmentsTab';
import { CompanyCostCentersTab } from './company/CompanyCostCentersTab';
import { CompanyPayrollPoliciesTab } from './company/CompanyPayrollPoliciesTab';
import { CompanyAccountsTab } from './company/CompanyAccountsTab';
import { CompanyDangerZoneTab } from './company/CompanyDangerZoneTab';
import { hasPermission } from '../utils/permissions';

interface CompanyProfileViewProps {
  company: Company;
  allCompanies: Company[];
  employees: Employee[];
  users: UserAccount[];
  activeRole: UserRole;
  currentUser?: UserAccount | null;
  qoyodConfig?: QoyodApiConfig;
  onSaveQoyodConfig?: (config: QoyodApiConfig) => Promise<boolean | void> | boolean | void;
  onOpenQoyodModal?: () => void;
  onUpdateCompany: (company: Company) => Promise<boolean | void> | boolean | void;
  onSelectCompany?: (companyId: string) => void;
  onSaveUser?: (user: UserAccount) => boolean | Promise<boolean>;
  onDeleteUser?: (userId: string) => boolean | Promise<boolean>;
  onDeleteAllCompanyEmployees?: (companyId: string) => Promise<boolean | void> | boolean | void;
}

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
  // Local editable company state
  const [formData, setFormData] = useState<Company>(() => ({
    ...JSON.parse(JSON.stringify(company)),
    bankDefinitions: getBankDefinitions(company.bankDefinitions),
  }));
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state if active company changes from outside
  React.useEffect(() => {
    if (company) {
      setFormData({ ...JSON.parse(JSON.stringify(company)), bankDefinitions: getBankDefinitions(company.bankDefinitions) });
    }
  }, [company]);

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

  const activeBankDefinitions = useMemo(
    () => getBankDefinitions(formData.bankDefinitions).filter(bank => bank.isActive !== false),
    [formData.bankDefinitions]
  );
  // Handle Save All Company Info
  const handleSaveCompany = async (customData?: Company, e?: React.FormEvent) => {
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
    const saved = await onUpdateCompany(normalizedCompany);
    if (saved === false) return;
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
        <CompanyDetailsTab
          formData={formData}
          fileInputRef={fileInputRef}
          setFormData={setFormData}
          onSave={() => { void handleSaveCompany(); }}
          tr={tr}
        />
      )}
      {activeSubTab === 'banking' && (
        <CompanyBankingTab
          formData={formData}
          activeBankDefinitions={activeBankDefinitions}
          language={language}
          setFormData={setFormData}
          onSave={() => { void handleSaveCompany(); }}
          tr={tr}
        />
      )}
      {/* SUB-TAB: Qoyod Accounting Integration */}
      {activeSubTab === 'qoyod' && (
        <CompanyQoyodTab
          formData={formData}
          employeesCount={companyEmployees.length}
          language={language}
          qoyodConfig={qoyodConfig}
          onSaveQoyodConfig={onSaveQoyodConfig}
          onOpenQoyodModal={onOpenQoyodModal}
          onSuccess={(message) => {
            setSaveSuccessMessage(message);
            setTimeout(() => setSaveSuccessMessage(null), 4000);
          }}
          tr={tr}
        />
      )}
      {/* SUB-TAB 3: Company Users Management */}
      {activeSubTab === 'users' && hasPermission(currentUser, 'MANAGE_USERS') && (
        <CompanyUsersTab
          company={formData}
          users={users}
          companyUsers={companyUsers}
          activeRole={activeRole}
          currentUser={currentUser}
          language={language}
          onSaveUser={onSaveUser}
          onDeleteUser={onDeleteUser}
          tr={tr}
        />
      )}
      {/* SUB-TAB 4: Departments Management */}
      {activeSubTab === 'departments' && (
        <CompanyDepartmentsTab
          company={formData}
          employees={companyEmployees}
          departments={departmentsList}
          language={language}
          setCompany={setFormData}
          onUpdateCompany={onUpdateCompany}
          tr={tr}
        />
      )}
      {/* SUB-TAB 5: Cost Centers */}
      {activeSubTab === 'cost_centers' && (
        <CompanyCostCentersTab
          company={formData}
          employees={companyEmployees}
          language={language}
          setCompany={setFormData}
          onUpdateCompany={onUpdateCompany}
          tr={tr}
        />
      )}

      {/* SUB-TAB 6: Policies & GOSI Calculation */}
      {activeSubTab === 'policies' && (
        <CompanyPayrollPoliciesTab
          formData={formData}
          setFormData={setFormData}
          onSave={() => { void handleSaveCompany(); }}
          tr={tr}
        />
      )}
      {/* SUB-TAB 7: Chart of Accounts */}
      {activeSubTab === 'accounts' && (
        <CompanyAccountsTab
          formData={formData}
          setFormData={setFormData}
          onSave={() => { void handleSaveCompany(); }}
          tr={tr}
        />
      )}

      {/* SUB-TAB 8: Sensitive Data Management */}
      {activeSubTab === 'danger' && hasPermission(currentUser, 'MANAGE_EMPLOYEES') && (
        <CompanyDangerZoneTab
          company={formData}
          employeesCount={companyEmployees.length}
          language={language}
          onArchiveEmployees={onDeleteAllCompanyEmployees}
          onSuccess={(message) => {
            setSaveSuccessMessage(message);
            setTimeout(() => setSaveSuccessMessage(null), 4000);
          }}
          tr={tr}
        />
      )}


      {/* ========================================================================= */}
      {/* USER MODAL */}
      {/* ========================================================================= */}

      {/* ========================================================================= */}
      {/* DEPARTMENT MODAL */}
      {/* ========================================================================= */}

      {/* ========================================================================= */}
      {/* COST CENTER MODAL */}
      {/* ========================================================================= */}

    </div>
  );
};
