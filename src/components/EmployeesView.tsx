import React, { useState, useMemo } from 'react';
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
import { useEmployeeImport } from './employees/useEmployeeImport';

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
