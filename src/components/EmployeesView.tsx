import React, { useState, useMemo, useRef } from 'react';
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  Download, 
  Edit, 
  Trash2, 
  FileText, 
  ShieldCheck, 
  AlertCircle, 
  Building2, 
  Sparkles,
  CheckCircle,
  X,
  CreditCard,
  Briefcase,
  UserPlus,
  Upload,
  FileSpreadsheet,
  UserCheck
} from 'lucide-react';
import { Company, Employee, EmploymentStatus, NationalityType, UserRole } from '../types';
import { formatSAR, roundAmount } from '../utils/payrollEngine';
import { downloadCsvFile } from '../utils/exportUtils';
import { 
  validateSaudiIBAN, 
  validateSwiftCode, 
  detectBankFromIBAN, 
  getSwiftCodeFromBankName, 
  getBankDefinitions
} from '../utils/security';
import {
  EmployeeImportField,
  ParsedEmployeeSheet,
  parseEmployeeSheet,
  parseMoney,
} from '../utils/employeeImport';
import { useLanguage } from '../i18n/LanguageContext';

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
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importSheet, setImportSheet] = useState<ParsedEmployeeSheet | null>(null);
  const [importMapping, setImportMapping] = useState<Record<number, EmployeeImportField | ''>>({});
  const [importError, setImportError] = useState('');
  const [isParsingImport, setIsParsingImport] = useState(false);
  const [isImportingEmployees, setIsImportingEmployees] = useState(false);

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
    gosiEnabled: false,
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
      gosiEnabled: false,
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

  const importFieldLabels: Record<EmployeeImportField, string> = {
    employeeNo: 'الرقم الوظيفي', fullName: 'اسم الموظف', nationalIdOrIqama: 'الهوية / الإقامة',
    country: 'الدولة / الجنسية', bankIban: 'IBAN', bankName: 'اسم البنك',
    bankSwiftCode: 'SWIFT / BIC', baseSalary: 'الراتب الأساسي', allowances: 'إضافات ثابتة',
    deductions: 'استقطاعات ثابتة', status: 'الحالة', notes: 'ملاحظات',
  };

  const getImportValue = (row: string[], field: EmployeeImportField): string => {
    const column = Object.entries(importMapping).find(([, mapped]) => mapped === field)?.[0];
    return column === undefined ? '' : (row[Number(column)] || '').trim();
  };

  const importPreview = useMemo(() => {
    if (!importSheet) return { valid: [] as Employee[], errors: [] as string[], duplicates: 0, adjusted: 0, ignored: 0, incomplete: 0 };
    const existingNumbers = new Set(companyEmployees.map(emp => emp.employeeNo.trim().toLowerCase()));
    const existingIqamas = new Set(companyEmployees.map(emp => emp.nationalIdOrIqama.trim()).filter(Boolean));
    const existingIbans = new Set(companyEmployees.map(emp => emp.bankIban.replace(/\s/g, '').toUpperCase()).filter(Boolean));
    const usedNumbers = new Set(existingNumbers);
    const seenIqamas = new Set(existingIqamas);
    const seenIbans = new Set(existingIbans);
    const valid: Employee[] = [];
    const errors: string[] = [];
    let duplicates = 0;
    let adjusted = 0;
    let ignored = 0;
    let incomplete = 0;
    const today = new Date().toISOString().slice(0, 10);

    importSheet.rows.forEach((row, index) => {
      const rowNo = importSheet.headerRow + index + 1;
      const sourceEmployeeNo = getImportValue(row, 'employeeNo');
      const fullName = getImportValue(row, 'fullName').replace(/\s+/g, ' ').trim();
      const iqama = getImportValue(row, 'nationalIdOrIqama').replace(/\s/g, '');
      const iban = getImportValue(row, 'bankIban').replace(/\s/g, '').toUpperCase();
      const salary = parseMoney(getImportValue(row, 'baseSalary'));
      const importedDeduction = Math.max(0, parseMoney(getImportValue(row, 'deductions')));
      // Totals, empty lines, and bank/SWIFT reference tables aren't employees.
      if (!fullName || salary <= 0) {
        ignored += 1;
        return;
      }
      if (!sourceEmployeeNo) {
        errors.push(`الصف ${rowNo}: الرقم الوظيفي غير محدد`);
        return;
      }
      // A matching Iqama/IBAN is the same employee; skip it on a repeated upload.
      if ((iqama && seenIqamas.has(iqama)) || (iban && seenIbans.has(iban))) {
        duplicates += 1;
        return;
      }
      const rowWarnings: string[] = [];
      const hasIncompleteData = !iqama || !iban || (iban ? !validateSaudiIBAN(iban) : false);
      if (!iqama) rowWarnings.push('رقم الإقامة غير مكتمل');
      if (!iban) rowWarnings.push('بيانات IBAN غير مكتملة');
      else if (!validateSaudiIBAN(iban)) rowWarnings.push('رقم IBAN يحتاج مراجعة');

      let employeeNo = sourceEmployeeNo;
      let employeeKey = employeeNo.toLowerCase();
      if (usedNumbers.has(employeeKey)) {
        const suffix = iqama || iban.slice(-8) || String(rowNo);
        const baseCandidate = `${sourceEmployeeNo}-${suffix}`;
        employeeNo = baseCandidate;
        let counter = 2;
        while (usedNumbers.has(employeeNo.toLowerCase())) {
          employeeNo = `${baseCandidate}-${counter}`;
          counter += 1;
        }
        employeeKey = employeeNo.toLowerCase();
        adjusted += 1;
        rowWarnings.push(`تم تعديل الرقم الوظيفي المكرر من ${sourceEmployeeNo} إلى ${employeeNo}`);
      }
      usedNumbers.add(employeeKey);
      if (iqama) seenIqamas.add(iqama);
      if (iban) seenIbans.add(iban);
      if (hasIncompleteData) incomplete += 1;
      const nameParts = fullName.split(' ');
      const firstName = nameParts.shift() || fullName;
      const lastName = nameParts.join(' ') || '-';
      const bankNameFromSheet = getImportValue(row, 'bankName');
      const detectedBank = iban && validateSaudiIBAN(iban) ? detectBankFromIBAN(iban, company.bankDefinitions) : null;
      const bankName = detectedBank?.nameAr || bankNameFromSheet || (iban ? 'غير محدد' : 'بيانات بنكية غير مكتملة');
      const swift = (detectedBank?.swiftCode || getSwiftCodeFromBankName(bankName, company.bankDefinitions) || getImportValue(row, 'bankSwiftCode') || '').toUpperCase();
      const country = getImportValue(row, 'country') || 'غير محدد';
      const rawStatus = getImportValue(row, 'status').toLowerCase();
      const status: EmploymentStatus = ['suspended', 'موقوف', 'معلق'].includes(rawStatus) ? 'SUSPENDED'
        : ['terminated', 'منتهي'].includes(rawStatus) ? 'TERMINATED'
        : ['leave', 'اجازة', 'إجازة'].includes(rawStatus) ? 'ON_LEAVE' : 'ACTIVE';
      valid.push({
        id: `emp-${company.id}-${Date.now()}-${index}`,
        companyId: company.id,
        employeeNo,
        firstNameAr: firstName,
        lastNameAr: lastName,
        firstNameEn: firstName,
        lastNameEn: lastName,
        nationalIdOrIqama: iqama,
        nationality: 'NON_SAUDI',
        country,
        email: '',
        phone: '',
        department: 'العمالة المنزلية',
        jobTitle: 'عاملة منزلية',
        costCenterId: company.costCenters[0]?.id || '',
        hireDate: today,
        salaryStartDate: today,
        prorateFirstMonth: false,
        status,
        bankName,
        bankCode: detectedBank?.code,
        bankIban: iban,
        bankSwiftCode: swift,
        dataWarnings: rowWarnings,
        salaryPackage: {
          baseSalary: salary,
          housingAllowance: 0,
          transportAllowance: 0,
          otherFixedAllowances: Math.max(0, parseMoney(getImportValue(row, 'allowances'))),
          nonGosiOtherAllowances: 0,
          customAllowances: [],
          customDeductions: importedDeduction > 0
            ? [{ componentId: 'imported-deduction', name: 'استقطاع مستورد', amount: importedDeduction }]
            : [],
        },
      });
    });
    return { valid, errors, duplicates, adjusted, ignored, incomplete };
  }, [importSheet, importMapping, companyEmployees, company.id, company.costCenters]);

  const handleImportFile = async (file?: File) => {
    if (!file) return;
    setIsParsingImport(true);
    setImportError('');
    try {
      const parsed = await parseEmployeeSheet(file);
      setImportSheet(parsed);
      setImportMapping(Object.fromEntries(parsed.columns.map(column => [column.index, column.suggestedField])));
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const messages: Record<string, string> = {
        FILE_TOO_LARGE: 'حجم الملف يتجاوز 5 ميجابايت',
        UNSUPPORTED_FILE: 'النوع غير مدعوم. استخدم XLSX أو CSV أو TSV',
        TOO_MANY_ROWS: 'الملف يتجاوز الحد الأقصى وهو 2500 صف',
        HEADER_NOT_FOUND: 'تعذر اكتشاف صف العناوين. تأكد من وجود الرقم الوظيفي والاسم والإقامة',
      };
      setImportError(messages[code] || 'تعذر قراءة الملف');
    } finally {
      setIsParsingImport(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const confirmEmployeeImport = async () => {
    if (!importPreview.valid.length) return;
    setIsImportingEmployees(true);
    try {
      if (onBulkImportEmployees) {
        const saved = await onBulkImportEmployees(importPreview.valid);
        if (saved === false) return;
      } else {
        await Promise.all(importPreview.valid.map(employee => Promise.resolve(handleSave(employee))));
      }
      setImportSheet(null);
      setImportMapping({});
    } finally {
      setIsImportingEmployees(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div data-no-translate className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-emerald-600" />
            <span>{language === 'ar' ? 'سجل الموظفين ومكونات الرواتب' : 'Employee Register & Salary Components'}</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200">
              {language === 'ar' ? `${filteredEmployees.length} من ${companyEmployees.length} موظف` : `${filteredEmployees.length} of ${companyEmployees.length} employees`}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {language === 'ar' ? 'إدارة بيانات الموظفين، الحسابات البنكية (IBAN)، سلم الرواتب والبدلات، وحالات تعليق الرواتب' : 'Manage employee records, bank accounts (IBAN), salaries, allowances, and payroll suspension statuses'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.csv,.tsv"
            className="hidden"
            onChange={(event) => handleImportFile(event.target.files?.[0])}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={isParsingImport}
            className="px-3.5 py-2 bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            <span>{isParsingImport ? (language === 'ar' ? 'جاري قراءة الملف...' : 'Reading file...') : (language === 'ar' ? 'استيراد موظفين' : 'Import Employees')}</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>{language === 'ar' ? 'تصدير Excel/CSV' : 'Export Excel/CSV'}</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>{language === 'ar' ? 'إضافة موظف جديد' : 'Add Employee'}</span>
          </button>
        </div>
      </div>

      {importError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {importError}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div data-no-translate className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          <input
            type="text"
            placeholder={language === 'ar' ? 'بحث بالاسم، الرقم الوظيفي، الهوية، الآيبان...' : 'Search by name, employee number, ID, or IBAN...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>

        {/* Dept Filter */}
        <div>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="ALL">{language === 'ar' ? `جميع الأقسام (${departments.length})` : `All departments (${departments.length})`}</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Nationality Filter */}
        <div>
          <select
            value={selectedNationality}
            onChange={(e) => setSelectedNationality(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="ALL">{language === 'ar' ? 'جميع الجنسيات (تأمينات GOSI)' : 'All nationalities (GOSI)'}</option>
            <option value="SAUDI">{language === 'ar' ? 'سعودي (خاضع لنسبة التأمينات 9.75%/11.75%)' : 'Saudi (GOSI 9.75% / 11.75%)'}</option>
            <option value="NON_SAUDI">{language === 'ar' ? 'غير سعودي (مخاطر مهنية 2%)' : 'Non-Saudi (2% occupational hazard)'}</option>
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="ALL">{language === 'ar' ? 'جميع الحالات الوظيفية' : 'All employment statuses'}</option>
            <option value="ACTIVE">{language === 'ar' ? 'على رأس العمل (نشط)' : 'Active'}</option>
            <option value="SUSPENDED">{language === 'ar' ? 'تعليق الصرف مع استمرار الاستحقاق' : 'Payment held — entitlement continues'}</option>
            <option value="ON_LEAVE">{language === 'ar' ? 'في إجازة' : 'On leave'}</option>
            <option value="TERMINATED">{language === 'ar' ? 'منتهي الخدمة' : 'Terminated'}</option>
            <option value="ABSCONDED">{language === 'ar' ? 'العمالة الهاربة' : 'Absconded workers'}</option>
          </select>
        </div>

      </div>

      {/* Employees Table */}
      {companyEmployees.some(emp => emp.status === 'ABSCONDED') && (
        <button
          data-no-translate
          type="button"
          onClick={() => setSelectedStatus(selectedStatus === 'ABSCONDED' ? 'ALL' : 'ABSCONDED')}
          className={`w-full rounded-2xl border px-4 py-3 flex items-center justify-between text-xs font-bold transition-colors ${selectedStatus === 'ABSCONDED' ? 'bg-rose-100 border-rose-300 text-rose-900' : 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100'}`}
        >
          <span>{language === 'ar' ? 'قائمة العمالة الهاربة — الرواتب معلقة ومستبعدة من المسير' : 'Absconded Workers — Salaries Suspended and Excluded from Payroll'}</span>
          <span className="px-2 py-1 rounded-full bg-white border border-rose-200 font-mono">{companyEmployees.filter(emp => emp.status === 'ABSCONDED').length}</span>
        </button>
      )}
      <div data-no-translate className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full">
        <table className="w-full text-right text-xs table-fixed divide-y divide-slate-100">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px]">
              <th className="py-3 px-2.5 w-[16%] font-bold">{language === 'ar' ? 'الرقم والموظف' : 'Employee & Number'}</th>
              <th className="py-3 px-2 w-[11%] font-bold">{language === 'ar' ? 'الهوية / الإقامة' : 'ID / Iqama'}</th>
              <th className="py-3 px-2 w-[13%] font-bold">{language === 'ar' ? 'القسم والمسمى' : 'Department & Job'}</th>
              <th className="py-3 px-2 w-[10%] font-bold">{language === 'ar' ? 'الجنسية والتأمينات' : 'Nationality & GOSI'}</th>
              <th className="py-3 px-2 w-[12%] font-bold">{language === 'ar' ? 'الحساب (IBAN)' : 'Bank Account (IBAN)'}</th>
              <th className="py-3 px-2 w-[13%] font-bold">{language === 'ar' ? 'الأساسي والبدلات' : 'Salary & Allowances'}</th>
              <th className="py-3 px-2 w-[8%] font-bold">{language === 'ar' ? 'إجمالي الراتب' : 'Gross Salary'}</th>
              <th className="py-3 px-1.5 w-[7%] text-center font-bold">{language === 'ar' ? 'الحالة' : 'Status'}</th>
              <th className="py-3 px-2 w-[10%] text-center font-bold">{language === 'ar' ? 'الإجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400">
                  {language === 'ar' ? 'لا توجد بيانات موظفين مطابقة لمعايير البحث' : 'No employees match the selected filters'}
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp, idx) => {
                const gross = 
                  emp.salaryPackage.baseSalary + 
                  emp.salaryPackage.housingAllowance + 
                  emp.salaryPackage.transportAllowance + 
                  (emp.salaryPackage.otherFixedAllowances || 0);

                const isSuspended = emp.status === 'SUSPENDED';
                const isAbsconded = emp.status === 'ABSCONDED';
                const resolvedBank = detectBankFromIBAN(emp.bankIban, company.bankDefinitions);
                const displayBankName = resolvedBank ? (language === 'en' ? resolvedBank.nameEn || resolvedBank.nameAr : resolvedBank.nameAr) : emp.bankName;
                const displaySwift = resolvedBank?.swiftCode || emp.bankSwiftCode;

                return (
                  <tr key={`${emp.id || 'emp'}-${idx}`} className="hover:bg-slate-50/80 transition-colors text-[11px]">
                    
                    {/* Name & Emp No */}
                    <td className="py-3 px-2.5 truncate">
                      <div className="font-bold text-slate-900 truncate">
                        {emp.firstNameAr} {emp.lastNameAr}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {emp.employeeNo}
                      </div>
                      {!!emp.dataWarnings?.length && (
                        <div className="text-[9px] text-amber-700 font-semibold flex items-center gap-1 mt-0.5" title={emp.dataWarnings.join(' • ')}>
                          <AlertCircle className="w-3 h-3" /> {language === 'ar' ? 'بيانات تحتاج استكمال' : 'Incomplete data'}
                        </div>
                      )}
                    </td>

                    {/* National ID / Iqama */}
                    <td className="py-3 px-2 font-mono text-slate-600 truncate">
                      {emp.nationalIdOrIqama || <span className="text-amber-600 font-sans">{language === 'ar' ? 'غير مكتملة' : 'Incomplete'}</span>}
                    </td>

                    {/* Dept & Job */}
                    <td className="py-3 px-2 truncate">
                      <div className="font-semibold text-slate-800 truncate">{emp.department}</div>
                      <div className="text-[10px] text-slate-500 truncate">{emp.jobTitle}</div>
                    </td>

                    {/* Nationality & GOSI */}
                    <td className="py-3 px-2 truncate">
                      {emp.nationality === 'SAUDI' ? (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold border text-[10px] ${emp.gosiEnabled === false ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                          <span>{emp.gosiEnabled === false ? 'سعودي — غير خاضع' : `GOSI ${((emp.gosiEmployeeRate ?? company.calculationRules?.saudiGosiEmployeeRate ?? 0.0975) * 100).toFixed(2)}%`}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[10px]">
                          <span>{emp.country}</span>
                        </span>
                      )}
                    </td>

                    {/* Bank & IBAN & SWIFT */}
                    <td className="py-3 px-2 truncate">
                      <div className="text-slate-800 font-medium truncate">{displayBankName}</div>
                      {emp.bankIban ? (
                        <div className="text-[10px] text-slate-500 font-mono truncate" title={emp.bankIban}>
                          {emp.bankIban.slice(0, 6)}...{emp.bankIban.slice(-4)}
                        </div>
                      ) : <div className="text-[9px] text-amber-600 font-semibold">{language === 'ar' ? 'IBAN غير مكتمل' : 'Incomplete IBAN'}</div>}
                      {displaySwift ? (
                        <div className="text-[9px] text-emerald-700 font-mono font-semibold truncate" title={`رمز السويفت: ${displaySwift}`}>
                          SWIFT: {displaySwift}
                        </div>
                      ) : (
                        <div className="text-[9px] text-slate-400 font-mono">
                          SWIFT: —
                        </div>
                      )}
                    </td>

                    {/* Salary Breakdown */}
                    <td className="py-3 px-2">
                      <div className="font-bold text-slate-800 whitespace-nowrap">
                        {language === 'ar' ? 'أساسي:' : 'Basic:'} {formatSAR(emp.salaryPackage.baseSalary)}
                      </div>
                      <div className="text-[9px] text-slate-500 whitespace-nowrap">
                        {language === 'ar' ? 'سكن:' : 'Housing:'} {formatSAR(emp.salaryPackage.housingAllowance)} | {language === 'ar' ? 'نقل:' : 'Transport:'} {formatSAR(emp.salaryPackage.transportAllowance)}
                      </div>
                    </td>

                    {/* Gross */}
                    <td className="py-3 px-2 font-black text-slate-900 whitespace-nowrap">
                      {formatSAR(gross)}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-1.5 text-center">
                      {isAbsconded ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[9px] font-bold border border-rose-200 block text-center" title={emp.suspensionReason}>
                          {language === 'ar' ? 'هارب' : 'Absconded'}
                        </span>
                      ) : isSuspended ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[9px] font-bold border border-amber-200 block text-center" title={emp.suspensionReason}>
                          {language === 'ar' ? 'موقوف' : 'Suspended'}
                        </span>
                      ) : emp.status === 'ACTIVE' ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-bold border border-emerald-200 block text-center">
                          {language === 'ar' ? 'نشط' : 'Active'}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-semibold block text-center">
                          {emp.status === 'ON_LEAVE' ? (language === 'ar' ? 'في إجازة' : 'On leave') : emp.status === 'TERMINATED' ? (language === 'ar' ? 'منتهي' : 'Terminated') : emp.status}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-1.5 text-center">
                      <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                        
                        {/* Payslip & Statement button */}
                        <button
                          onClick={() => handleStatement(emp)}
                          title={language === 'ar' ? 'كشف حساب الموظف وقسيمة الراتب' : 'Employee statement and payslip'}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors cursor-pointer shrink-0"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>

                        {emp.status === 'ONBOARDING' && (
                          <button
                            type="button"
                            onClick={() => handleCompleteOnboarding(emp)}
                            title={language === 'ar' ? 'إدخال رقم الإقامة والآيبان وتحويل الموظف إلى نشط' : 'Enter Iqama and IBAN, then activate'}
                            className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 p-1 text-emerald-700 hover:bg-emerald-100"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Edit */}
                        <button
                          onClick={() => handleOpenEdit(emp)}
                          title={language === 'ar' ? 'تعديل بيانات الموظف والراتب' : 'Edit employee and salary'}
                          className="p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors cursor-pointer shrink-0"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => {
                            const name = language === 'ar' ? `${emp.firstNameAr} ${emp.lastNameAr}` : (`${emp.firstNameEn} ${emp.lastNameEn}`.trim() || `${emp.firstNameAr} ${emp.lastNameAr}`);
                            if (window.confirm(language === 'ar' ? `هل تريد حذف الموظف «${name}»؟ إذا كان مرتبطًا بحركات سابقة فسيتم أرشفته مع حفظ السجلات.` : `Delete “${name}”? If historical records exist, the employee will be archived and history retained.`)) {
                              if (onDeleteEmployee) {
                                onDeleteEmployee(emp.id);
                              } else {
                                alert(language === 'ar' ? 'تعذر بدء الحذف: وظيفة الحذف غير مرتبطة بهذه الشاشة.' : 'Could not start deletion: the delete action is not connected to this view.');
                              }
                            }
                          }}
                          title={language === 'ar' ? 'حذف الموظف' : 'Delete employee'}
                          className="p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                      </div>
                    </td>

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Spreadsheet Import Preview */}
      {importSheet && (
        <div data-no-translate className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-6xl w-full max-h-[92vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl"><FileSpreadsheet className="w-5 h-5" /></div>
                <div>
                  <h3 className="font-bold">{language === 'ar' ? 'معاينة استيراد الموظفين' : 'Employee Import Preview'}</h3>
                  <p className="text-xs text-slate-400">{importSheet.fileName} — {language === 'ar' ? 'صف العناوين' : 'header row'} {importSheet.headerRow}</p>
                </div>
              </div>
              <button onClick={() => setImportSheet(null)} className="p-2 hover:bg-white/10 rounded-xl cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-emerald-800"><b>{importPreview.valid.length}</b> {language === 'ar' ? 'صف صالح للاستيراد' : 'valid rows'}</div>
                <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-sky-800"><b>{importPreview.adjusted}</b> {language === 'ar' ? 'رقم مكرر تم تصحيحه' : 'duplicate numbers corrected'}</div>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-amber-800"><b>{importPreview.incomplete}</b> {language === 'ar' ? 'موظف يحتاج استكمال بيانات' : 'employees need data completion'}</div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-slate-700"><b>{importPreview.ignored}</b> {language === 'ar' ? 'صف غير موظف تم تجاهله' : 'non-employee rows ignored'}</div>
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-rose-800"><b>{importPreview.errors.length}</b> {language === 'ar' ? 'صف به أخطاء' : 'rows with errors'}</div>
              </div>

              {importPreview.duplicates > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  {language === 'ar' ? `تم تجاهل ${importPreview.duplicates} موظف موجود مسبقًا بنفس الإقامة أو IBAN.` : `${importPreview.duplicates} existing employees with the same Iqama or IBAN were skipped.`}
                </div>
              )}

              <div>
                <h4 className="font-bold text-sm text-slate-900 mb-2">{language === 'ar' ? 'مطابقة أعمدة الشيت' : 'Map Spreadsheet Columns'}</h4>
                <p className="text-xs text-slate-500 mb-3">{language === 'ar' ? 'راجع المطابقة التلقائية. في نموذجك يتم اقتراح cards كاسم البنك وCASH كرمز SWIFT.' : 'Review the automatic mapping. In your template, cards is suggested as bank name and CASH as SWIFT code.'}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {importSheet.columns.map(column => (
                    <label key={column.index} className="rounded-xl border border-slate-200 p-2 bg-slate-50">
                      <span className="block text-[11px] font-semibold text-slate-600 truncate mb-1" title={column.header}>{column.header}</span>
                      <select
                        value={importMapping[column.index] || ''}
                        onChange={(event) => setImportMapping(prev => ({ ...prev, [column.index]: event.target.value as EmployeeImportField | '' }))}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                      >
                        <option value="">{language === 'ar' ? 'تجاهل العمود' : 'Ignore column'}</option>
                        {Object.entries(importFieldLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="min-w-full text-xs text-right">
                  <thead className="bg-slate-100 text-slate-600"><tr>
                    <th className="p-2">#</th>
                    {importSheet.columns.map(column => <th key={column.index} className="p-2 whitespace-nowrap">{column.header}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {importSheet.rows.slice(0, 8).map((row, rowIndex) => <tr key={rowIndex}>
                      <td className="p-2 text-slate-400">{importSheet.headerRow + rowIndex + 1}</td>
                      {importSheet.columns.map(column => <td key={column.index} className="p-2 whitespace-nowrap max-w-48 truncate" title={row[column.index]}>{row[column.index] || '—'}</td>)}
                    </tr>)}
                  </tbody>
                </table>
              </div>

              {importPreview.errors.length > 0 && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                  <b>{language === 'ar' ? 'أول الأخطاء:' : 'First errors:'}</b> {importPreview.errors.slice(0, 5).join(' • ')}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button onClick={() => setImportSheet(null)} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold cursor-pointer">{language === 'ar' ? 'إلغاء' : 'Cancel'}</button>
              <button
                onClick={confirmEmployeeImport}
                disabled={!importPreview.valid.length || isImportingEmployees}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImportingEmployees
                  ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...')
                  : (language === 'ar' ? `استيراد ${importPreview.valid.length} موظف` : `Import ${importPreview.valid.length} employees`)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div data-no-translate className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    {editingEmployee
                      ? (language === 'ar' ? 'تعديل بيانات الموظف وسلم الراتب' : 'Edit employee and salary package')
                      : (language === 'ar' ? 'إضافة موظف جديد للمنشأة' : 'Add a new employee')}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {language === 'ar' ? 'المنشأة' : 'Company'}: {language === 'ar' ? company.nameAr : (company.nameEn || company.nameAr)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleFormSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              
              {!editingEmployee && (
                <div data-employee-type-wizard className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div>
                    <div className="text-xs font-black text-slate-900">{language === 'ar' ? '1. حدد نوع الموظف' : '1. Choose employee type'}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{language === 'ar' ? 'سيتم إظهار الحقول المطلوبة فقط حسب الاختيار.' : 'Only the fields required for the selected path will be shown.'}</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button type="button" onClick={() => { setNonSaudiEntryMode(''); setFormData({ ...formData, nationality: 'SAUDI', country: '', gosiEnabled: true, entryDate: '', entryNumber: '', iqamaNumber: '', iqamaExpiryDate: '', iqamaIssueStatus: 'PENDING', nationalIdOrIqama: '' }); }} className={`p-4 rounded-xl border text-start transition-all ${formData.nationality === 'SAUDI' ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/10' : 'border-slate-200 bg-white hover:border-emerald-300'}`}>
                      <div className="font-black text-sm text-slate-900">{language === 'ar' ? 'موظف سعودي' : 'Saudi employee'}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{language === 'ar' ? 'هوية وطنية + بيانات العقد والتأمينات' : 'National ID + contract and GOSI details'}</div>
                    </button>
                    <button type="button" onClick={() => { setFormData({ ...formData, nationality: 'NON_SAUDI', country: '', gosiEnabled: false, contractStartDate: '', contractEndDate: '', nationalIdOrIqama: '' }); setNonSaudiEntryMode(''); }} className={`p-4 rounded-xl border text-start transition-all ${formData.nationality === 'NON_SAUDI' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/10' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
                      <div className="font-black text-sm text-slate-900">{language === 'ar' ? 'موظف غير سعودي' : 'Non-Saudi employee'}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{language === 'ar' ? 'قادم جديد أو موظف لديه إقامة' : 'New arrival or existing iqama holder'}</div>
                    </button>
                  </div>
                  {formData.nationality === 'NON_SAUDI' && (
                    <div className="pt-3 border-t border-slate-200">
                      <div className="text-xs font-black text-slate-900 mb-2">{language === 'ar' ? '2. حالة الموظف غير السعودي' : '2. Non-Saudi status'}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button type="button" onClick={() => { setNonSaudiEntryMode('NEW_ARRIVAL'); setFormData({ ...formData, nationality: 'NON_SAUDI', iqamaNumber: '', iqamaExpiryDate: '', iqamaIssueStatus: 'PENDING', nationalIdOrIqama: String(formData.entryNumber || '') }); }} className={`p-3 rounded-xl border text-start ${nonSaudiEntryMode === 'NEW_ARRIVAL' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                          <div className="font-bold text-xs">{language === 'ar' ? 'قادم جديد برقم الدخول / الحدود' : 'New arrival with entry / border number'}</div>
                          <div className="text-[10px] text-slate-500 mt-1">{language === 'ar' ? 'لم تصدر له الإقامة بعد' : 'Iqama has not been issued yet'}</div>
                        </button>
                        <button type="button" onClick={() => { setNonSaudiEntryMode('IQAMA_HOLDER'); setFormData({ ...formData, nationality: 'NON_SAUDI', entryDate: '', entryNumber: '', iqamaIssueStatus: 'ISSUED', nationalIdOrIqama: String(formData.iqamaNumber || '') }); }} className={`p-3 rounded-xl border text-start ${nonSaudiEntryMode === 'IQAMA_HOLDER' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                          <div className="font-bold text-xs">{language === 'ar' ? 'لديه إقامة' : 'Iqama holder'}</div>
                          <div className="text-[10px] text-slate-500 mt-1">{language === 'ar' ? 'نسجل رقم الإقامة وتاريخ انتهائها' : 'Record iqama number and expiry date'}</div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isCompletingOnboarding && (
                <div data-onboarding-activation className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
                  <div className="flex items-center gap-2 font-black"><UserCheck className="h-4 w-4" />{language === 'ar' ? 'استكمال بيانات الإقامة وتفعيل الموظف' : 'Complete Iqama details and activate employee'}</div>
                  <p className="mt-1 text-[11px]">{language === 'ar' ? 'أدخل رقم الإقامة الجديد والآيبان السعودي الصحيح. عند الحفظ ستتغير الحالة تلقائيًا إلى نشط.' : 'Enter the new Iqama number and a valid Saudi IBAN. Saving will automatically set the employee to Active.'}</p>
                </div>
              )}
              
              {/* Section 1: Basic Identity */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>{language === 'ar' ? 'البيانات الشخصية والهوية' : 'Personal details and identity'}</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'الرقم الوظيفي' : 'Employee number'}</label>
                    <input type="text" required value={formData.employeeNo || ''} onChange={e => setFormData({ ...formData, employeeNo: e.target.value.toUpperCase() })} className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900" />
                    <div className="text-[9px] text-slate-400 mt-1">{language === 'ar' ? 'يُقترح تلقائيًا ويمكنك استبداله برمز وظيفي خاص قبل الحفظ' : 'Suggested automatically; you may replace it with your own employee code before saving'}</div>
                  </div>

                  {formData.nationality === 'SAUDI' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'رقم الهوية الوطنية *' : 'National ID *'}</label>
                      <input type="text" required value={formData.nationalIdOrIqama || ''} onChange={e => setFormData({ ...formData, nationalIdOrIqama: e.target.value })} className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20" />
                    </div>
                  )}
                  {formData.nationality === 'NON_SAUDI' && nonSaudiEntryMode === 'NEW_ARRIVAL' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'رقم الدخول / الحدود *' : 'Entry / border number *'}</label>
                      <input type="text" required value={formData.entryNumber || ''} onChange={e => setFormData({ ...formData, entryNumber: e.target.value, nationalIdOrIqama: e.target.value })} className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500/20" />
                    </div>
                  )}
                  {formData.nationality === 'NON_SAUDI' && nonSaudiEntryMode === 'IQAMA_HOLDER' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'رقم الإقامة *' : 'Iqama number *'}</label>
                      <input type="text" required value={formData.iqamaNumber || ''} onChange={e => setFormData({ ...formData, iqamaNumber: e.target.value, nationalIdOrIqama: e.target.value, iqamaIssueStatus: 'ISSUED' })} className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20" />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'الاسم الأول (بالعربي) *' : 'First name (Arabic) *'}</label>
                    <input
                      type="text"
                      required
                      value={formData.firstNameAr || ''}
                      onChange={(e) => setFormData({ ...formData, firstNameAr: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'اسم العائلة (بالعربي) *' : 'Last name (Arabic) *'}</label>
                    <input
                      type="text"
                      required
                      value={formData.lastNameAr || ''}
                      onChange={(e) => setFormData({ ...formData, lastNameAr: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  {formData.nationality === 'SAUDI' && (
                    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 rounded-2xl bg-emerald-50/60 border border-emerald-200">
                      <label className="sm:col-span-4 flex items-center gap-2 font-bold text-emerald-900">
                        <input type="checkbox" checked={formData.gosiEnabled !== false} onChange={(e) => setFormData({ ...formData, gosiEnabled: e.target.checked })} />
                        {language === 'ar' ? 'تطبيق التأمينات الاجتماعية على الموظف' : 'Apply GOSI to this employee'}
                      </label>
                      <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'طريقة تحمل اشتراك GOSI' : 'GOSI payment method'}</label>
                      <select
                        disabled={formData.gosiEnabled === false}
                        value={formData.saudiGosiPaymentMode || 'SHARED'}
                        onChange={(e) => setFormData({ ...formData, saudiGosiPaymentMode: e.target.value as 'SHARED' | 'COMPANY_FULL' })}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                      >
                        <option value="SHARED">{language === 'ar' ? 'عادي: حصة على الموظف وحصة على الشركة' : 'Shared: employee and employer contributions'}</option>
                        <option value="COMPANY_FULL">{language === 'ar' ? 'الشركة تتحمل الاشتراك كاملًا دون خصم الموظف' : 'Company pays the full contribution'}</option>
                      </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'نسبة الموظف %' : 'Employee rate %'}</label>
                        <input type="number" min="0" max="100" step="0.01" disabled={formData.gosiEnabled === false} value={((formData.gosiEmployeeRate ?? company.calculationRules?.saudiGosiEmployeeRate ?? 0.0975) * 100)} onChange={(e) => setFormData({ ...formData, gosiEmployeeRate: Math.max(0, Number(e.target.value) || 0) / 100 })} className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'نسبة الشركة %' : 'Employer rate %'}</label>
                        <input type="number" min="0" max="100" step="0.01" disabled={formData.gosiEnabled === false} value={((formData.gosiEmployerRate ?? company.calculationRules?.saudiGosiEmployerRate ?? 0.1175) * 100)} onChange={(e) => setFormData({ ...formData, gosiEmployerRate: Math.max(0, Number(e.target.value) || 0) / 100 })} className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-mono" />
                      </div>
                      <div className="text-[11px] text-emerald-800 self-end pb-2">{language === 'ar' ? 'تُطبق النسب على الأساسي + بدل السكن حتى الحد الأعلى للمنشأة.' : 'Rates apply to basic salary + housing allowance up to the company ceiling.'}</div>
                    </div>
                  )}

                  {formData.nationality === 'NON_SAUDI' && (
                    <div className="sm:col-span-2 p-3 rounded-2xl bg-purple-50/60 border border-purple-200">
                      <label className="flex items-center gap-2 font-bold text-purple-900">
                        <input type="checkbox" checked={formData.gosiEnabled !== false} onChange={(e) => setFormData({ ...formData, gosiEnabled: e.target.checked })} />
                        {language === 'ar' ? 'تطبيق تأمين المخاطر المهنية' : 'Apply occupational hazards insurance'}
                      </label>
                      <p className="mt-1 text-[11px] text-purple-800">
                        {language === 'ar'
                          ? `لا يُخصم اشتراك من راتب الموظف غير السعودي؛ تتحمل المنشأة فقط نسبة ${(Number(company.calculationRules?.nonSaudiGosiEmployerHazardRate ?? 0.02) * 100).toFixed(2)}% من الأساسي + بدل السكن.`
                          : `No contribution is deducted from a non-Saudi employee. The employer pays ${(Number(company.calculationRules?.nonSaudiGosiEmployerHazardRate ?? 0.02) * 100).toFixed(2)}% of basic salary + housing for occupational hazards.`}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'الدولة' : 'Country'}</label>
                    <input
                      type="text"
                      value={formData.country || ''}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Job & Department */}
              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>{language === 'ar' ? 'بيانات الوظيفة والتعيين' : 'Employment details'}</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'القسم *' : 'Department *'}</label>
                    <input
                      type="text"
                      list="company-departments-list"
                      required
                      placeholder={language === 'ar' ? 'اختر أو اكتب اسم القسم...' : 'Select or enter a department...'}
                      value={formData.department || ''}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                    <datalist id="company-departments-list">
                      {(company.departments || []).map((d, idx) => (
                        <option key={`${d.id || 'd'}-${idx}`} value={d.nameAr}>
                          {d.nameAr} ({d.code})
                        </option>
                      ))}
                      {/* Standard fallbacks if none defined yet */}
                      {(!company.departments || company.departments.length === 0) && (
                        <>
                          <option value="الإدارة العامة" />
                          <option value="تقنية المعلومات" />
                          <option value="المالية والمحاسبة" />
                          <option value="المبيعات والتسويق" />
                          <option value="الموارد البشرية" />
                          <option value="العمليات والتشغيل" />
                        </>
                      )}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'المسمى الوظيفي *' : 'Job title *'}</label>
                    <input
                      type="text"
                      required
                      value={formData.jobTitle || ''}
                      onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'مركز التكلفة *' : 'Cost center *'}</label>
                    <select
                      value={formData.costCenterId || ''}
                      onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    >
                      {company.costCenters.map(cc => (
                        <option key={cc.id} value={cc.id}>{cc.code} - {language === 'ar' ? cc.nameAr : (cc.nameEn || cc.nameAr)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'تاريخ التعيين' : 'Hire date'}</label>
                    <input
                      type="date"
                      value={formData.hireDate || ''}
                      onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'بداية استحقاق الراتب' : 'Salary eligibility start'}</label>
                    <input
                      type="date"
                      value={formData.salaryStartDate || ''}
                      onChange={(e) => setFormData({ ...formData, salaryStartDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.prorateFirstMonth === true}
                        onChange={(e) => setFormData({ ...formData, prorateFirstMonth: e.target.checked })}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>
                        <span className="block text-xs font-bold text-slate-800">{language === 'ar' ? 'احتساب أول شهر باليوم' : 'Prorate the first month by day'}</span>
                        <span className="block text-[10px] text-slate-500 mt-0.5">{language === 'ar' ? 'غير مفعّل افتراضيًا؛ عند تفعيله يُحسب الراتب من تاريخ بداية الاستحقاق حتى نهاية الشهر.' : 'Off by default. When enabled, salary is calculated from the eligibility date through month end.'}</span>
                      </span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'الحالة الوظيفية' : 'Employment status'}</label>
                    <select
                      value={formData.status || 'ACTIVE'}
                      onChange={(e) => {
                        const status = e.target.value as EmploymentStatus;
                        setFormData({
                          ...formData,
                          status,
                          employmentEndReason: status === 'ABSCONDED' ? 'ABSCONDED' : (status === 'TERMINATED' ? formData.employmentEndReason : undefined),
                          terminationDate: status === 'TERMINATED' || status === 'ABSCONDED' ? formData.terminationDate : undefined,
                        });
                      }}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    >
                      <option value="ONBOARDING">{language === 'ar' ? 'تحت الاستكمال — رقم حدود' : 'Onboarding — border number'}</option>
                      <option value="ACTIVE">{language === 'ar' ? 'على رأس العمل' : 'Active'}</option>
                      <option value="SUSPENDED">{language === 'ar' ? 'تعليق الصرف مع استمرار الاستحقاق' : 'Payment held — entitlement continues'}</option>
                      <option value="ON_LEAVE">{language === 'ar' ? 'إجازة' : 'On leave'}</option>
                      <option value="TERMINATED">{language === 'ar' ? 'منتهي الخدمة' : 'Terminated'}</option>
                      <option value="ABSCONDED">{language === 'ar' ? 'هروب — تعليق واستبعاد الراتب' : 'Absconded — payroll suspended'}</option>
                    </select>
                  </div>
                </div>

                {/* Suspension Details if Suspended */}
                {formData.status === 'SUSPENDED' && (
                  <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-amber-900 mb-1">{language === 'ar' ? 'سبب تعليق صرف الراتب' : 'Salary payment hold reason'}</label>
                      <input
                        type="text"
                        value={formData.suspensionReason || ''}
                        onChange={(e) => setFormData({ ...formData, suspensionReason: e.target.value })}
                        placeholder={language === 'ar' ? 'مثال: إجازة استثنائية بدون راتب، تحقيق إداري...' : 'Example: unpaid leave, internal investigation...'}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {formData.status === 'TERMINATED' && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-blue-900 mb-1">{language === 'ar' ? 'سبب تصفية الراتب *' : 'Final settlement reason *'}</label>
                      <select required value={formData.employmentEndReason || ''} onChange={(e) => setFormData({ ...formData, employmentEndReason: e.target.value as Employee['employmentEndReason'] })} className="w-full px-3 py-2 text-xs bg-white border border-blue-300 rounded-lg">
                        <option value="">{language === 'ar' ? '-- اختر السبب --' : '-- Select reason --'}</option>
                        <option value="SPONSOR_TRANSFER">{language === 'ar' ? 'نقل كفالة' : 'Sponsorship transfer'}</option>
                        <option value="FINAL_EXIT">{language === 'ar' ? 'خروج نهائي' : 'Final exit'}</option>
                        <option value="OTHER">{language === 'ar' ? 'انتهاء خدمة آخر' : 'Other termination'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-blue-900 mb-1">{language === 'ar' ? 'تاريخ النقل / الخروج النهائي *' : 'Transfer / final-exit date *'}</label>
                      <input type="date" required value={formData.terminationDate || ''} onChange={(e) => setFormData({ ...formData, terminationDate: e.target.value })} className="w-full px-3 py-2 text-xs bg-white border border-blue-300 rounded-lg" />
                    </div>
                    <p className="sm:col-span-2 text-[11px] text-blue-800">{language === 'ar' ? 'سيحسب المسير الراتب حتى هذا التاريخ شاملًا، ويستبعد الموظف من المسيرات التالية.' : 'Payroll will include salary through this date, then exclude the employee from subsequent runs.'}</p>
                  </div>
                )}

                {formData.status === 'ABSCONDED' && (
                  <div className="mt-3 p-3 bg-rose-50 rounded-xl border border-rose-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-rose-900 mb-1">{language === 'ar' ? 'تاريخ تسجيل الهروب *' : 'Absconding report date *'}</label>
                      <input type="date" required value={formData.terminationDate || ''} onChange={(e) => setFormData({ ...formData, terminationDate: e.target.value, employmentEndReason: 'ABSCONDED', suspensionReason: 'هروب' })} className="w-full px-3 py-2 text-xs bg-white border border-rose-300 rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-rose-900 mb-1">{language === 'ar' ? 'ملاحظات / مرجع البلاغ' : 'Notes / report reference'}</label>
                      <input type="text" value={formData.suspensionReason || ''} onChange={(e) => setFormData({ ...formData, suspensionReason: e.target.value })} className="w-full px-3 py-2 text-xs bg-white border border-rose-300 rounded-lg" />
                    </div>
                    <p className="sm:col-span-2 text-[11px] text-rose-800">{language === 'ar' ? 'سيُنقل الموظف إلى قائمة العمالة الهاربة ويُستبعد راتبه بالكامل من أي مسير جديد.' : 'The employee will move to the absconded list and be fully excluded from new payroll runs.'}</p>
                  </div>
                )}
              </div>

              {/* Section 3: Bank, IBAN & SWIFT Code */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{language === 'ar' ? 'الحساب البنكي وحماية الأجور (WPS) وبيانات السويفت (SWIFT/BIC)' : 'Bank account, WPS and SWIFT/BIC details'}</span>
                  </h4>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-semibold">
                    {language === 'ar' ? 'مطابق لمعايير البنك المركزي السعودي (SAMA)' : 'SAMA compliant'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  
                  {/* Bank Name */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">{language === 'ar' ? 'اسم البنك *' : 'Bank name *'}</label>
                      <span className="text-[10px] text-slate-400">{language === 'ar' ? 'البنوك المعتمدة' : 'Approved banks'}</span>
                    </div>
                    <select
                      value={formData.bankCode || detectBankFromIBAN(formData.bankIban, company.bankDefinitions)?.code || getBankDefinitions(company.bankDefinitions).find(bank => bank.nameAr === formData.bankName || bank.nameEn === formData.bankName)?.ibanBankCode || ''}
                      onChange={(e) => {
                        const selectedBank = getBankDefinitions(company.bankDefinitions).find(bank => bank.ibanBankCode === e.target.value);
                        setFormData({ 
                          ...formData, 
                          bankCode: selectedBank?.ibanBankCode || '',
                          bankName: selectedBank?.nameAr || '',
                          bankSwiftCode: selectedBank?.swiftCode || formData.bankSwiftCode || ''
                        });
                      }}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                    >
                      <option value="">{language === 'ar' ? '-- اختر البنك --' : '-- Select bank --'}</option>
                      {getBankDefinitions(company.bankDefinitions).filter(b => b.isActive !== false).map(b => (
                        <option key={b.ibanBankCode} value={b.ibanBankCode}>
                          {language === 'en' ? b.nameEn || b.nameAr : b.nameAr} ({b.swiftCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Guided lifecycle fields */}
                  {formData.nationality && (
                    <div className="sm:col-span-2 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-black text-slate-900">{language === 'ar' ? 'بيانات المستندات والمتابعة' : 'Documents and onboarding'}</div>
                        <span className="px-2 py-1 rounded-lg border border-amber-200 bg-white text-[10px] font-bold text-amber-800">
                          {validateSaudiIBAN(String(formData.bankIban || '').replace(/\s/g, '').toUpperCase()) ? (language === 'ar' ? 'IBAN جاهز للتحويل' : 'IBAN ready for transfer') : (language === 'ar' ? 'IBAN غير مطلوب عند التسجيل' : 'IBAN not required at registration')}
                        </span>
                      </div>
                      {formData.nationality === 'SAUDI' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div><label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'بداية العقد' : 'Contract start'}</label><input type="date" value={formData.contractStartDate || ''} onChange={e => setFormData({ ...formData, contractStartDate: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs" /></div>
                          <div><label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'نهاية العقد *' : 'Contract end *'}</label><input type="date" required value={formData.contractEndDate || ''} onChange={e => setFormData({ ...formData, contractEndDate: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs" /></div>
                        </div>
                      )}
                      {formData.nationality === 'NON_SAUDI' && nonSaudiEntryMode === 'NEW_ARRIVAL' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div><label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'تاريخ الدخول للمملكة *' : 'Entry date *'}</label><input type="date" required value={formData.entryDate || ''} onChange={e => setFormData({ ...formData, entryDate: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs" /></div>
                          <div className="rounded-xl bg-white border border-amber-200 p-3 text-[10px] text-amber-800">{language === 'ar' ? 'سيظل الموظف تحت متابعة إصدار الإقامة. يمكن تسجيل الراتب الآن، أما التحويل البنكي فيتطلب IBAN صحيحًا.' : 'The employee remains under iqama onboarding. Salary may be recorded now; bank transfer requires a valid IBAN.'}</div>
                        </div>
                      )}
                      {formData.nationality === 'NON_SAUDI' && nonSaudiEntryMode === 'IQAMA_HOLDER' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div><label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'تاريخ انتهاء الإقامة *' : 'Iqama expiry date *'}</label><input type="date" required value={formData.iqamaExpiryDate || ''} onChange={e => setFormData({ ...formData, iqamaExpiryDate: e.target.value, iqamaIssueStatus: 'ISSUED' })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs" /></div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* IBAN */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">{language === 'ar' ? 'رقم الآيبان (IBAN) — اختياري عند التسجيل' : 'IBAN — optional at registration'}</label>
                      {formData.bankIban && (
                        validateSaudiIBAN(formData.bankIban) ? (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                            <CheckCircle className="w-3 h-3" /> {language === 'ar' ? 'آيبان صحيح' : 'Valid IBAN'}
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5">
                            <AlertCircle className="w-3 h-3" /> {language === 'ar' ? 'آيبان غير مكتمل' : 'Incomplete IBAN'}
                          </span>
                        )
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="SAXXXXXXXXXXXXXXXXXXXXXXXX"
                      value={formData.bankIban || ''}
                      onChange={(e) => {
                        const cleanIban = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                        const detected = detectBankFromIBAN(cleanIban, company.bankDefinitions);
                        setFormData({ 
                          ...formData, 
                          bankIban: cleanIban,
                          bankCode: detected?.code || formData.bankCode,
                          bankName: detected ? detected.nameAr : formData.bankName,
                          bankSwiftCode: detected ? detected.swiftCode : formData.bankSwiftCode
                        });
                      }}
                      className={`w-full px-3 py-2 text-xs bg-slate-50 border rounded-xl focus:bg-white font-mono tracking-wider transition-all ${
                        formData.bankIban && validateSaudiIBAN(formData.bankIban)
                          ? 'border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                          : 'border-slate-200 focus:border-blue-500'
                      }`}
                      dir="ltr"
                    />
                  </div>

                  {/* SWIFT / BIC Code */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">{language === 'ar' ? 'رمز السويفت (SWIFT / BIC)' : 'SWIFT / BIC code'}</label>
                      <button
                        type="button"
                        onClick={() => {
                          let code = '';
                          if (formData.bankIban) {
                            const det = detectBankFromIBAN(formData.bankIban, company.bankDefinitions);
                            if (det) code = det.swiftCode;
                          }
                          if (!code && formData.bankName) {
                            code = getSwiftCodeFromBankName(formData.bankName, company.bankDefinitions);
                          }
                          if (code) {
                            setFormData({ ...formData, bankSwiftCode: code });
                          } else {
                            alert(language === 'ar' ? 'يرجى تحديد اسم البنك أو إدخال رقم آيبان سعودي صالح ليتم التوليد التلقائي لرمز السويفت' : 'Select a bank or enter a valid Saudi IBAN to generate the SWIFT code.');
                          }
                        }}
                        className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 cursor-pointer"
                        title={language === 'ar' ? 'توليد وتحديث رمز السويفت تلقائياً بناءً على البنك أو الآيبان' : 'Generate or update SWIFT from the bank or IBAN'}
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>{language === 'ar' ? 'توليد تلقائي' : 'Auto-generate'}</span>
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder={language === 'ar' ? 'مثال: RJHISARI أو NCBKSARI' : 'Example: RJHISARI or NCBKSARI'}
                        value={formData.bankSwiftCode || ''}
                        onChange={(e) => {
                          const swiftVal = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                          setFormData({ ...formData, bankSwiftCode: swiftVal });
                        }}
                        className={`w-full px-3 py-2 text-xs bg-slate-50 border rounded-xl focus:bg-white font-mono tracking-wider transition-all uppercase ${
                          formData.bankSwiftCode && validateSwiftCode(formData.bankSwiftCode)
                            ? 'border-emerald-400 bg-emerald-50/20 text-emerald-900 focus:ring-2 focus:ring-emerald-500/20'
                            : formData.bankSwiftCode
                            ? 'border-amber-300 bg-amber-50/20 text-amber-900 focus:ring-2 focus:ring-amber-500/20'
                            : 'border-slate-200 focus:border-emerald-500'
                        }`}
                        dir="ltr"
                        maxLength={11}
                      />
                    </div>

                    {/* SWIFT Validation Badge / Help text */}
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      {formData.bankSwiftCode ? (
                        validateSwiftCode(formData.bankSwiftCode) ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle className="w-2.5 h-2.5" /> {language === 'ar' ? 'رمز سويفت قياسي معتمد (ISO 9362)' : 'Valid ISO 9362 SWIFT code'}
                          </span>
                        ) : (
                          <span className="text-amber-600 font-semibold flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" /> {language === 'ar' ? 'الصيغة القياسية: 8 أو 11 حرفاً ورقم' : 'Standard format: 8 or 11 letters/digits'}
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400">
                          {language === 'ar' ? 'يتولد تلقائياً من رقم الآيبان والبنك' : 'Generated automatically from IBAN and bank'}
                        </span>
                      )}
                      <span className="text-slate-400 font-mono">
                        {(formData.bankSwiftCode || '').length}/11
                      </span>
                    </div>
                  </div>

                </div>
              </div>

              {/* Section 4: Salary Package */}
              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span>{language === 'ar' ? 'سلم الرواتب والبدلات الثابتة (SR)' : 'Salary and fixed allowances (SR)'}</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'الراتب الأساسي *' : 'Basic salary *'}</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.salaryPackage?.baseSalary ?? 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        salaryPackage: {
                          ...formData.salaryPackage!,
                          baseSalary: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'بدل السكن' : 'Housing allowance'}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.salaryPackage?.housingAllowance ?? 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        salaryPackage: {
                          ...formData.salaryPackage!,
                          housingAllowance: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'بدل النقل' : 'Transport allowance'}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.salaryPackage?.transportAllowance ?? 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        salaryPackage: {
                          ...formData.salaryPackage!,
                          transportAllowance: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'بدلات أخرى ثابتة' : 'Other fixed allowances'}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.salaryPackage?.otherFixedAllowances ?? 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        salaryPackage: {
                          ...formData.salaryPackage!,
                          otherFixedAllowances: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'بدلات أخرى غير خاضعة لـ GOSI' : 'Other non-GOSI allowances'}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.salaryPackage?.nonGosiOtherAllowances ?? 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        salaryPackage: {
                          ...formData.salaryPackage!,
                          nonGosiOtherAllowances: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 text-xs bg-amber-50 border border-amber-200 rounded-xl focus:bg-white"
                    />
                  </div>
                </div>

                {/* Total Gross Display */}
                <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900">{language === 'ar' ? 'إجمالي الراتب الشهري الثابت:' : 'Total fixed monthly salary:'}</span>
                  <span className="text-sm font-extrabold text-emerald-800 font-mono">
                    {formatSAR(
                      (formData.salaryPackage?.baseSalary || 0) +
                      (formData.salaryPackage?.housingAllowance || 0) +
                      (formData.salaryPackage?.transportAllowance || 0) +
                      (formData.salaryPackage?.otherFixedAllowances || 0) +
                      (formData.salaryPackage?.nonGosiOtherAllowances || 0)
                    )}
                  </span>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  {isCompletingOnboarding
                    ? (language === 'ar' ? 'حفظ وتفعيل الموظف' : 'Save and activate employee')
                    : editingEmployee
                      ? (language === 'ar' ? 'حفظ التعديلات' : 'Save changes')
                      : (language === 'ar' ? 'إضافة الموظف الآن' : 'Add employee')}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
