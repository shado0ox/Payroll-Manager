import React, { useEffect, useState, useMemo } from 'react';
import { Company, Employee, UserRole } from '../types';
import { downloadCsvFile } from '../utils/exportUtils';
import { 
  validateSaudiIBAN, 
  detectBankFromIBAN, 
  getSwiftCodeFromBankName
} from '../utils/security';
import { useLanguage } from '../i18n/LanguageContext';
import { EmployeeImportPreviewModal } from './employees/EmployeeImportPreviewModal';
import { EmployeesTable } from './employees/EmployeesTable';
import { EmployeeFormModal } from './employees/EmployeeFormModal';
import { EmployeesToolbar } from './employees/EmployeesToolbar';
import { EmployeePayrollTotals } from './employees/EmployeePayrollTotals';
import { useEmployeeImport } from './employees/useEmployeeImport';
import { api, type EmployeeBankChangeRequest } from '../utils/api';

interface EmployeesViewProps {
  company: Company;
  employees: Employee[];
  loans?: any[];
  activeRole: UserRole;
  onSaveEmployee?: (emp: Employee) => Promise<void> | void;
  onBulkImportEmployees?: (employees: Employee[]) => Promise<boolean | void> | boolean | void;
  onViewStatement?: (emp: Employee) => void;
  onAddEmployee?: (emp: Employee) => void;
  onUpdateEmployee?: (emp: Employee) => void;
  onDeleteEmployee?: (empId: string) => void;
  onViewEmployeeStatement?: (emp: Employee) => void;
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  company,
  employees,
  loans = [],
  activeRole,
  onSaveEmployee,
  onBulkImportEmployees,
  onViewStatement,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onViewEmployeeStatement,
}) => {
  const { language } = useLanguage();
  const handleSave = (emp: Employee) => {
    if (onSaveEmployee) onSaveEmployee(emp);
    if (onUpdateEmployee && employees.some(e => e.id === emp.id)) onUpdateEmployee(emp);
    else if (onAddEmployee) onAddEmployee(emp);
  };

  const handleStatement = (emp: Employee) => {
    if (onViewStatement) onViewStatement(emp);
    else if (onViewEmployeeStatement) onViewEmployeeStatement(emp);
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedNationality, setSelectedNationality] = useState<string>('ALL');
  const [bankRequests,setBankRequests] = useState<EmployeeBankChangeRequest[]>([]);
  const [bankRequestsLoading,setBankRequestsLoading] = useState(false);
  const [bankRequestsError,setBankRequestsError] = useState('');
  const loadBankRequests = async () => {
    setBankRequestsLoading(true); setBankRequestsError('');
    try { setBankRequests((await api.employeeBankChangeRequests(company.id,'PENDING')).requests); }
    catch (error:any) { setBankRequestsError(String(error?.message || 'BANK_CHANGE_REQUESTS_LOAD_FAILED')); }
    finally { setBankRequestsLoading(false); }
  };
  useEffect(() => { void loadBankRequests(); },[company.id]);
  const reviewBankRequest = async (request:EmployeeBankChangeRequest,decision:'APPROVED'|'REJECTED') => {
    const promptText = decision === 'APPROVED'
      ? (language === 'ar' ? 'ملاحظة الاعتماد (اختياري):' : 'Approval note (optional):')
      : (language === 'ar' ? 'اكتب سبب الرفض:' : 'Enter the rejection reason:');
    const reason = window.prompt(promptText,'');
    if (reason === null || (decision === 'REJECTED' && !reason.trim())) return;
    setBankRequestsLoading(true); setBankRequestsError('');
    try { await api.reviewEmployeeBankChangeRequest(request.id,decision,reason.trim()); await loadBankRequests(); }
    catch (error:any) { setBankRequestsError(String(error?.message || 'BANK_CHANGE_REVIEW_FAILED')); setBankRequestsLoading(false); }
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isCompletingOnboarding, setIsCompletingOnboarding] = useState(false);
  const [nonSaudiEntryMode, setNonSaudiEntryMode] = useState<'NEW_ARRIVAL' | 'IQAMA_HOLDER' | ''>('');

  // Form Fields
  const [formData, setFormData] = useState<Partial<Employee>>({
    companyId: company.id,
    employeeNo: '',
    firstNameAr: '',
    lastNameAr: '',
    firstNameEn: '',
    lastNameEn: '',
    nationalIdOrIqama: '',
    nationality: '' as any,
    country: '',
    email: '',
    phone: '',
    department: '',
    jobTitle: '',
    costCenterId: company.costCenters[0]?.id || '',
    hireDate: '',
    salaryStartDate: '',
    annualLeaveEntitlementDays: 21,
    prorateFirstMonth: false,
    entryDate: '',
    entryNumber: '',
    iqamaNumber: '',
    iqamaIssueStatus: 'PENDING',
    iqamaExpiryDate: '',
    contractStartDate: '',
    contractEndDate: '',
    bankAccountStatus: 'PENDING',
    onboardingStatus: 'COMPLETE',
    status: '' as any,
    bankName: '',
    bankIban: '',
    bankSwiftCode: '',
    gosiEnabled: true,
    gosiEmployeeRate: company.calculationRules?.saudiGosiEmployeeRate ?? 0.0975,
    gosiEmployerRate: company.calculationRules?.saudiGosiEmployerRate ?? 0.1175,
    saudiGosiPaymentMode: 'SHARED',
    salaryPackage: {
      baseSalary: 0,
      housingAllowance: 0,
      transportAllowance: 0,
      otherFixedAllowances: 0,
      nonGosiOtherAllowances: 0,
      customAllowances: [],
      customDeductions: [],
    }
  });

  // Filtered List
  const companyEmployees = useMemo(() => {
    return employees.filter(e => e.companyId === company.id);
  }, [employees, company.id]);

  const filteredEmployees = useMemo(() => {
    return companyEmployees.filter(emp => {
      const matchesSearch = 
        emp.employeeNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        `${emp.firstNameAr} ${emp.lastNameAr}`.includes(searchTerm) ||
        emp.nationalIdOrIqama.includes(searchTerm) ||
        emp.bankIban.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.bankSwiftCode && emp.bankSwiftCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (emp.bankName && emp.bankName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        emp.jobTitle.includes(searchTerm);

      const matchesDept = selectedDept === 'ALL' || emp.department === selectedDept;
      const matchesStatus = selectedStatus === 'ALL' || emp.status === selectedStatus;
      const matchesNat = selectedNationality === 'ALL' || emp.nationality === selectedNationality;

      return matchesSearch && matchesDept && matchesStatus && matchesNat;
    });
  }, [companyEmployees, searchTerm, selectedDept, selectedStatus, selectedNationality]);

  // Departments list for filter
  const departments = useMemo(() => {
    return Array.from(new Set(companyEmployees.map(e => e.department)));
  }, [companyEmployees]);

  const getNextEmployeeNo = () => {
    let highest = 1000;
    let prefix = 'EMP-';
    for (const employee of companyEmployees) {
      const value = String(employee.employeeNo || '').trim();
      const match = value.match(/^(.*?)(\d+)$/);
      if (!match) continue;
      const numeric = Number(match[2]);
      if (Number.isFinite(numeric) && numeric >= highest) {
        highest = numeric;
        prefix = match[1] || '';
      }
    }
    return prefix + String(highest + 1);
  };

  const handleOpenAdd = () => {
    setEditingEmployee(null);
    setNonSaudiEntryMode('');
    setFormData({
      companyId: company.id,
      employeeNo: getNextEmployeeNo(),
      firstNameAr: '',
      lastNameAr: '',
      firstNameEn: '',
      lastNameEn: '',
      nationalIdOrIqama: '',
      nationality: undefined,
      country: '',
      email: '',
      phone: '',
      department: '',
      jobTitle: '',
      costCenterId: '',
      hireDate: '',
      salaryStartDate: '',
      annualLeaveEntitlementDays: 21,
      prorateFirstMonth: false,
      entryDate: '',
      entryNumber: '',
      iqamaNumber: '',
      iqamaIssueStatus: 'PENDING',
      iqamaExpiryDate: '',
      contractStartDate: '',
      contractEndDate: '',
      bankAccountStatus: 'PENDING',
      onboardingStatus: 'NEW_ARRIVAL',
      status: 'ACTIVE',
      bankName: '',
      bankIban: '',
      bankSwiftCode: '',
      gosiEnabled: true,
      gosiEmployeeRate: company.calculationRules?.saudiGosiEmployeeRate ?? 0.0975,
      gosiEmployerRate: company.calculationRules?.saudiGosiEmployerRate ?? 0.1175,
      saudiGosiPaymentMode: 'SHARED',
      salaryPackage: {
        baseSalary: 0,
        housingAllowance: 0,
        transportAllowance: 0,
        otherFixedAllowances: 0,
        nonGosiOtherAllowances: 0,
        customAllowances: [],
        customDeductions: [],
      },
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setIsCompletingOnboarding(false);
    if (emp.nationality === 'NON_SAUDI') {
      setNonSaudiEntryMode(emp.iqamaNumber || emp.iqamaExpiryDate || emp.iqamaIssueStatus === 'ISSUED' ? 'IQAMA_HOLDER' : 'NEW_ARRIVAL');
    } else {
      setNonSaudiEntryMode('');
    }
    setEditingEmployee(emp);
    const empCopy = JSON.parse(JSON.stringify(emp));
    if (empCopy.nationality === 'NON_SAUDI') empCopy.gosiEnabled = true;
    const legacyIdentity = String(empCopy.nationalIdOrIqama || '').trim();
    const explicitNewArrival = empCopy.nationality === 'NON_SAUDI' && Boolean(empCopy.entryNumber) && empCopy.iqamaIssueStatus !== 'ISSUED';
    if (empCopy.nationality === 'NON_SAUDI' && legacyIdentity && !explicitNewArrival) {
      // Employees imported before lifecycle/onboarding fields already store the iqama
      // in nationalIdOrIqama. Preserve that identity and treat them as iqama holders.
      if (!empCopy.iqamaNumber) empCopy.iqamaNumber = legacyIdentity;
      if (!empCopy.iqamaIssueStatus || empCopy.iqamaIssueStatus === 'PENDING') empCopy.iqamaIssueStatus = 'ISSUED';
      if (!empCopy.onboardingStatus || empCopy.onboardingStatus === 'NEW_ARRIVAL' || empCopy.onboardingStatus === 'WAITING_IQAMA') {
        empCopy.onboardingStatus = empCopy.bankIban ? 'COMPLETE' : 'WAITING_BANK';
      }
    }
    // Saudi legacy employees keep their existing nationalIdOrIqama unchanged.
    setNonSaudiEntryMode(empCopy.nationality === 'NON_SAUDI' ? (explicitNewArrival ? 'NEW_ARRIVAL' : (empCopy.iqamaNumber || legacyIdentity ? 'IQAMA_HOLDER' : 'NEW_ARRIVAL')) : '');
    // Auto-detect swift code if not present
    if (!empCopy.bankSwiftCode && empCopy.bankIban) {
      const detected = detectBankFromIBAN(empCopy.bankIban, company.bankDefinitions);
      if (detected) {
        empCopy.bankSwiftCode = detected.swiftCode;
      } else if (empCopy.bankName) {
        empCopy.bankSwiftCode = getSwiftCodeFromBankName(empCopy.bankName, company.bankDefinitions);
      }
    }
    setFormData(empCopy);
    setIsModalOpen(true);
  };

  const handleCompleteOnboarding = (emp: Employee) => {
    const empCopy = JSON.parse(JSON.stringify(emp)) as Employee;
    empCopy.status = 'ACTIVE';
    empCopy.nationalIdOrIqama = '';
    empCopy.iqamaNumber = '';
    empCopy.iqamaIssueStatus = 'ISSUED';
    empCopy.bankIban = '';
    empCopy.bankCode = '';
    empCopy.bankName = '';
    empCopy.bankSwiftCode = '';
    empCopy.gosiEnabled = true;
    setNonSaudiEntryMode('IQAMA_HOLDER');
    setEditingEmployee(emp);
    setIsCompletingOnboarding(true);
    setFormData(empCopy);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee && !formData.nationality) {
      alert(language === 'ar' ? 'اختر أولًا نوع الموظف: سعودي أو غير سعودي' : 'Choose the employee type first: Saudi or non-Saudi');
      return;
    }
    if (!editingEmployee && formData.nationality === 'NON_SAUDI' && !nonSaudiEntryMode) {
      alert(language === 'ar' ? 'اختر حالة الموظف غير السعودي: قادم جديد برقم الدخول أو لديه إقامة' : 'Choose the non-Saudi path: new arrival or iqama holder');
      return;
    }
    const normalizedEmployeeNo = String(formData.employeeNo || '').trim().toUpperCase();
    if (employees.some(emp => emp.companyId === company.id && emp.id !== editingEmployee?.id && String(emp.employeeNo || '').trim().toUpperCase() === normalizedEmployeeNo)) {
      alert(language === 'ar' ? 'الرقم الوظيفي مستخدم لموظف آخر' : 'Employee number is already used by another employee');
      return; // EMPLOYEE_NUMBER_LOCAL_DUPLICATE
    }
    if (!formData.firstNameAr || !formData.lastNameAr || !formData.employeeNo) {
      alert(language === 'ar' ? 'يرجى تعبئة الحقول الإلزامية' : 'Please complete all required fields');
      return;
    }
    if ((formData.status === 'TERMINATED' || formData.status === 'ABSCONDED') && !formData.terminationDate) {
      alert(language === 'ar' ? 'يرجى تحديد تاريخ النقل أو الخروج النهائي أو الهروب' : 'Please enter the sponsorship transfer, final exit, or absconding date');
      return;
    }
    if (formData.status === 'TERMINATED' && !formData.employmentEndReason) {
      alert(language === 'ar' ? 'يرجى تحديد سبب تصفية الراتب' : 'Please select the payroll settlement reason');
      return;
    }

    if (!editingEmployee && formData.nationality === 'NON_SAUDI') {
      if (!formData.iqamaExpiryDate && !formData.entryDate) {
        alert(language === 'ar' ? 'أدخل تاريخ انتهاء الإقامة أو تاريخ الدخول للقادم الجديد' : 'Enter the iqama expiry date or the new arrival entry date');
        return;
      }
      if (!formData.iqamaExpiryDate && !formData.entryNumber) {
        alert(language === 'ar' ? 'رقم الدخول مطلوب للقادم الجديد قبل إصدار الإقامة' : 'Entry number is required before iqama issuance');
        return;
      }
    }
    if (!editingEmployee && formData.nationality === 'SAUDI' && !formData.contractEndDate) {
      alert(language === 'ar' ? 'تاريخ انتهاء العقد مطلوب للموظف السعودي' : 'Contract end date is required for Saudi employees');
      return;
    }

    const normalizedIdentity = formData.nationality === 'NON_SAUDI'
      ? (nonSaudiEntryMode === 'NEW_ARRIVAL' ? String(formData.entryNumber || '').trim() : String(formData.iqamaNumber || '').trim())
      : String(formData.nationalIdOrIqama || '').trim();

    const normalizedIban = String(formData.bankIban || '').replace(/\s/g, '').toUpperCase();
    if (normalizedIban && !validateSaudiIBAN(normalizedIban)) {
      alert(language === 'ar' ? 'رقم IBAN المدخل غير صحيح. اتركه فارغًا إذا لم يصدر الحساب البنكي بعد.' : 'The entered IBAN is invalid. Leave it empty if the bank account has not been issued yet.');
      return;
    }
    const hasBankAccount = Boolean(normalizedIban) && validateSaudiIBAN(normalizedIban);
    const hasIqama = formData.nationality !== 'NON_SAUDI' || Boolean(formData.iqamaExpiryDate);
    const derivedOnboardingStatus = formData.nationality === 'NON_SAUDI' && !hasIqama
      ? 'WAITING_IQAMA' as const
      : !hasBankAccount ? 'WAITING_BANK' as const : 'COMPLETE' as const;

    // Standardize SWIFT code uppercase
    const processedForm = {
      ...formData,
      nationalIdOrIqama: normalizedIdentity,
      iqamaIssueStatus: formData.nationality === 'NON_SAUDI' && hasIqama ? 'ISSUED' as const : 'PENDING' as const,
      bankAccountStatus: hasBankAccount ? 'READY' as const : 'PENDING' as const,
      onboardingStatus: derivedOnboardingStatus,
      status: editingEmployee
        ? (formData.status === 'ONBOARDING'
            ? (derivedOnboardingStatus === 'COMPLETE' ? 'ACTIVE' as const : 'ONBOARDING' as const)
            : (formData.status || 'ACTIVE'))
        : (derivedOnboardingStatus !== 'COMPLETE' ? 'ONBOARDING' as const : (formData.status || 'ACTIVE')),
      employmentEndReason: formData.status === 'ABSCONDED' ? 'ABSCONDED' as const : formData.employmentEndReason,
      suspensionReason: formData.status === 'ABSCONDED' ? (formData.suspensionReason || 'هروب') : formData.suspensionReason,
      bankIban: normalizedIban,
      bankSwiftCode: formData.bankSwiftCode ? formData.bankSwiftCode.trim().toUpperCase() : ''
    };

    if (isCompletingOnboarding) {
      const iqama = String(processedForm.nationalIdOrIqama || '').replace(/\D/g, '');
      const iban = String(processedForm.bankIban || '').replace(/\s/g, '').toUpperCase();
      if (!/^\d{10}$/.test(iqama)) {
        alert(language === 'ar' ? 'رقم الإقامة يجب أن يتكون من 10 أرقام.' : 'Iqama number must contain exactly 10 digits.');
        return;
      }
      if (!validateSaudiIBAN(iban)) {
        alert(language === 'ar' ? 'أدخل رقم آيبان سعودي صحيح ومكتمل قبل تفعيل الموظف.' : 'Enter a complete valid Saudi IBAN before activating the employee.');
        return;
      }
      processedForm.nationalIdOrIqama = iqama;
      processedForm.bankIban = iban;
      processedForm.status = 'ACTIVE';
    }

    try {
      if (editingEmployee) {
        const updated = processedForm as Employee;
        if (onSaveEmployee) await onSaveEmployee(updated);
        else if (onUpdateEmployee) await Promise.resolve(onUpdateEmployee(updated));
      } else {
        const newEmp: Employee = {
          ...processedForm as Employee,
          id: `emp-${company.id}-${Date.now()}`,
        };
        if (onSaveEmployee) await onSaveEmployee(newEmp);
        else if (onAddEmployee) await Promise.resolve(onAddEmployee(newEmp));
      }
      setIsModalOpen(false);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'EMPLOYEE_SAVE_FAILED';
      alert(language === 'ar'
        ? 'تعذر حفظ الموظف في قاعدة البيانات. لم يتم إغلاق النموذج حتى لا تفقد البيانات. (' + code + ')'
        : 'Employee could not be saved to the database. The form remains open so the data is not lost. (' + code + ')');
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    const headers = ['الرقم الوظيفي', 'الاسم بالعربي', 'الهوية/الإقامة', 'الجنسية', 'تحمل GOSI', 'القسم', 'المسمى الوظيفي', 'تاريخ التعيين', 'الحالة', 'البنك', 'الآيبان IBAN', 'رمز السويفت SWIFT/BIC', 'الراتب الأساسي', 'بدل سكن', 'بدل نقل', 'بدلات أخرى', 'بدلات أخرى غير خاضعة لـ GOSI', 'إجمالي الراتب'];
    const rows = filteredEmployees.map(e => [
      `"${e.employeeNo}"`,
      `"${e.firstNameAr} ${e.lastNameAr}"`,
      `"${e.nationalIdOrIqama}"`,
      e.nationality === 'SAUDI' ? 'سعودي' : 'غير سعودي',
      e.nationality === 'SAUDI'
        ? (e.gosiEnabled === false ? 'غير خاضع' : `${e.saudiGosiPaymentMode === 'COMPANY_FULL' ? 'الشركة كاملًا' : 'مشترك'} (${((e.gosiEmployeeRate ?? company.calculationRules?.saudiGosiEmployeeRate ?? 0.0975) * 100).toFixed(2)}% / ${((e.gosiEmployerRate ?? company.calculationRules?.saudiGosiEmployerRate ?? 0.1175) * 100).toFixed(2)}%)`)
        : (e.gosiEnabled === false ? 'غير خاضع' : `مخاطر مهنية على الشركة (${((company.calculationRules?.nonSaudiGosiEmployerHazardRate ?? 0.02) * 100).toFixed(2)}%)`),
      `"${e.department}"`,
      `"${e.jobTitle}"`,
      `"${e.hireDate}"`,
      `"${e.status}"`,
      `"${e.bankName}"`,
      `"${e.bankIban}"`,
      `"${e.bankSwiftCode || ''}"`,
      e.salaryPackage.baseSalary.toFixed(2),
      e.salaryPackage.housingAllowance.toFixed(2),
      e.salaryPackage.transportAllowance.toFixed(2),
      (e.salaryPackage.otherFixedAllowances || 0).toFixed(2),
      (e.salaryPackage.nonGosiOtherAllowances || 0).toFixed(2),
      (e.salaryPackage.baseSalary + e.salaryPackage.housingAllowance + e.salaryPackage.transportAllowance + (e.salaryPackage.otherFixedAllowances || 0) + (e.salaryPackage.nonGosiOtherAllowances || 0)).toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    downloadCsvFile(`Employees_List_${company.nameEn || 'Company'}.csv`, csvContent);
  };

  const {
    importInputRef,
    importSheet,
    setImportSheet,
    importMapping,
    setImportMapping,
    importError,
    isParsingImport,
    isImportingEmployees,
    importFieldLabels,
    importPreview,
    handleImportFile,
    confirmEmployeeImport,
  } = useEmployeeImport({
    company,
    companyEmployees,
    onBulkImportEmployees,
    saveEmployee: handleSave,
  });

  return (
    <div className="space-y-6">
      
      <EmployeesToolbar
        language={language}
        filteredCount={filteredEmployees.length}
        companyEmployeeCount={companyEmployees.length}
        importInputRef={importInputRef}
        isParsingImport={isParsingImport}
        importError={importError}
        searchTerm={searchTerm}
        selectedDept={selectedDept}
        selectedNationality={selectedNationality}
        selectedStatus={selectedStatus}
        departments={departments}
        onImportFile={handleImportFile}
        onExportCsv={handleExportCsv}
        onOpenAdd={handleOpenAdd}
        setSearchTerm={setSearchTerm}
        setSelectedDept={setSelectedDept}
        setSelectedNationality={setSelectedNationality}
        setSelectedStatus={setSelectedStatus}
      />

      {(bankRequests.length > 0 || bankRequestsError) && <section className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">{language === 'ar' ? 'طلبات تعديل بيانات البنك' : 'Bank details change requests'}</h2><p className="mt-1 text-xs text-slate-500">{language === 'ar' ? 'لا تُطبّق البيانات الجديدة إلا بعد الاعتماد.' : 'New bank details are applied only after approval.'}</p></div><button type="button" onClick={() => void loadBankRequests()} disabled={bankRequestsLoading} className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-800">{language === 'ar' ? 'تحديث' : 'Refresh'}</button></div>
        {bankRequestsError && <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{bankRequestsError}</div>}
        {bankRequests.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-slate-500"><th className="p-2 text-start">{language === 'ar' ? 'الموظف' : 'Employee'}</th><th className="p-2 text-start">{language === 'ar' ? 'البيانات الحالية' : 'Current details'}</th><th className="p-2 text-start">{language === 'ar' ? 'البيانات المطلوبة' : 'Requested details'}</th><th className="p-2 text-start">{language === 'ar' ? 'السبب' : 'Reason'}</th><th className="p-2"></th></tr></thead><tbody>{bankRequests.map(request => <tr key={request.id} className="border-b last:border-0"><td className="p-2 font-bold">{request.employeeName}<div className="text-xs text-slate-500" dir="ltr">{request.employeeNo}</div></td><td className="p-2"><div>{request.currentBankName || '—'}</div><div className="font-mono text-xs" dir="ltr">{request.currentIban || '—'}</div></td><td className="p-2"><div className="font-bold text-sky-800">{request.requestedBankName}</div><div className="font-mono text-xs" dir="ltr">{request.requestedIban}</div><div className="text-xs" dir="ltr">{request.requestedSwiftCode || '—'}</div></td><td className="max-w-48 p-2 text-xs text-slate-600">{request.employeeReason || '—'}</td><td className="p-2"><div className="flex justify-end gap-2"><button type="button" disabled={bankRequestsLoading} onClick={() => void reviewBankRequest(request,'APPROVED')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">{language === 'ar' ? 'اعتماد' : 'Approve'}</button><button type="button" disabled={bankRequestsLoading} onClick={() => void reviewBankRequest(request,'REJECTED')} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">{language === 'ar' ? 'رفض' : 'Reject'}</button></div></td></tr>)}</tbody></table></div>}
      </section>}

      <EmployeePayrollTotals
        language={language}
        company={company}
        employees={filteredEmployees}
      />

      <EmployeesTable
        language={language}
        company={company}
        companyEmployees={companyEmployees}
        filteredEmployees={filteredEmployees}
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
        handleStatement={handleStatement}
        handleCompleteOnboarding={handleCompleteOnboarding}
        handleOpenEdit={handleOpenEdit}
        onDeleteEmployee={onDeleteEmployee}
      />

      {importSheet && (
        <EmployeeImportPreviewModal
          language={language}
          importSheet={importSheet}
          importMapping={importMapping}
          importFieldLabels={importFieldLabels}
          importPreview={importPreview}
          isImportingEmployees={isImportingEmployees}
          onMappingChange={setImportMapping}
          onClose={() => setImportSheet(null)}
          onConfirm={confirmEmployeeImport}
        />
      )}

      <EmployeeFormModal
        language={language}
        company={company}
        isOpen={isModalOpen}
        editingEmployee={editingEmployee}
        isCompletingOnboarding={isCompletingOnboarding}
        formData={formData}
        setFormData={setFormData}
        nonSaudiEntryMode={nonSaudiEntryMode}
        setNonSaudiEntryMode={setNonSaudiEntryMode}
        onSubmit={handleFormSubmit}
        onClose={() => setIsModalOpen(false)}
      />

    </div>
  );
};
