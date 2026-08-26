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
  FileSpreadsheet
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
  onSaveEmployee?: (emp: Employee) => void;
  onBulkImportEmployees?: (employees: Employee[]) => void;
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
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importSheet, setImportSheet] = useState<ParsedEmployeeSheet | null>(null);
  const [importMapping, setImportMapping] = useState<Record<number, EmployeeImportField | ''>>({});
  const [importError, setImportError] = useState('');
  const [isParsingImport, setIsParsingImport] = useState(false);

  // Form Fields
  const [formData, setFormData] = useState<Partial<Employee>>({
    companyId: company.id,
    employeeNo: '',
    firstNameAr: '',
    lastNameAr: '',
    firstNameEn: '',
    lastNameEn: '',
    nationalIdOrIqama: '',
    nationality: 'SAUDI',
    country: 'المملكة العربية السعودية',
    email: '',
    phone: '',
    department: 'تقنية المعلومات',
    jobTitle: '',
    costCenterId: company.costCenters[0]?.id || '',
    hireDate: '2026-01-01',
    salaryStartDate: '2026-01-01',
    status: 'ACTIVE',
    bankName: 'مصرف الراجحي',
    bankIban: 'SA',
    bankSwiftCode: 'RJHISARI',
    gosiEnabled: true,
    gosiEmployeeRate: company.calculationRules?.saudiGosiEmployeeRate ?? 0.0975,
    gosiEmployerRate: company.calculationRules?.saudiGosiEmployerRate ?? 0.1175,
    saudiGosiPaymentMode: 'SHARED',
    salaryPackage: {
      baseSalary: 6000,
      housingAllowance: 1500,
      transportAllowance: 600,
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

  const handleOpenAdd = () => {
    const nextNum = companyEmployees.length + 1;
    const isComp1 = company.id === 'comp-1';
    setEditingEmployee(null);
    setFormData({
      companyId: company.id,
      employeeNo: `${isComp1 ? 'EMP' : 'LOG'}-${1000 + nextNum}`,
      firstNameAr: '',
      lastNameAr: '',
      firstNameEn: '',
      lastNameEn: '',
      nationalIdOrIqama: '10' + Math.floor(10000000 + Math.random() * 90000000),
      nationality: 'SAUDI',
      country: 'المملكة العربية السعودية',
      email: `emp${nextNum}@advtech.sa`,
      phone: '05' + Math.floor(10000000 + Math.random() * 90000000),
      department: departments[0] || 'الموارد البشرية',
      jobTitle: 'أخصائي شؤون إدارية',
      costCenterId: company.costCenters[0]?.id || '',
      hireDate: '2026-01-01',
      salaryStartDate: '2026-01-01',
      status: 'ACTIVE',
      bankName: 'مصرف الراجحي',
      bankIban: 'SA4480000' + Math.floor(100000000000 + Math.random() * 900000000000),
      bankSwiftCode: 'RJHISARI',
      gosiEnabled: true,
      gosiEmployeeRate: company.calculationRules?.saudiGosiEmployeeRate ?? 0.0975,
      gosiEmployerRate: company.calculationRules?.saudiGosiEmployerRate ?? 0.1175,
      saudiGosiPaymentMode: 'SHARED',
      salaryPackage: {
        baseSalary: 7000,
        housingAllowance: 1750,
        transportAllowance: 700,
        otherFixedAllowances: 0,
        nonGosiOtherAllowances: 0,
        customAllowances: [],
        customDeductions: [],
      }
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    const empCopy = JSON.parse(JSON.stringify(emp));
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

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstNameAr || !formData.lastNameAr || !formData.employeeNo) {
      alert('يرجى تعبئة الحقول الإلزامية');
      return;
    }
    if ((formData.status === 'TERMINATED' || formData.status === 'ABSCONDED') && !formData.terminationDate) {
      alert('يرجى تحديد تاريخ النقل أو الخروج النهائي أو الهروب');
      return;
    }
    if (formData.status === 'TERMINATED' && !formData.employmentEndReason) {
      alert('يرجى تحديد سبب تصفية الراتب');
      return;
    }

    // Standardize SWIFT code uppercase
    const processedForm = {
      ...formData,
      employmentEndReason: formData.status === 'ABSCONDED' ? 'ABSCONDED' as const : formData.employmentEndReason,
      suspensionReason: formData.status === 'ABSCONDED' ? (formData.suspensionReason || 'هروب') : formData.suspensionReason,
      bankSwiftCode: formData.bankSwiftCode ? formData.bankSwiftCode.trim().toUpperCase() : ''
    };

    if (editingEmployee) {
      const updated = processedForm as Employee;
      if (onSaveEmployee) onSaveEmployee(updated);
      else if (onUpdateEmployee) onUpdateEmployee(updated);
    } else {
      const newEmp: Employee = {
        ...processedForm as Employee,
        id: `emp-${company.id}-${Date.now()}`,
      };
      if (onSaveEmployee) onSaveEmployee(newEmp);
      else if (onAddEmployee) onAddEmployee(newEmp);
    }
    setIsModalOpen(false);
  };

  // Export to CSV
  const handleExportCsv = () => {
    const headers = ['الرقم الوظيفي', 'الاسم بالعربي', 'الهوية/الإقامة', 'الجنسية', 'تحمل GOSI', 'القسم', 'المسمى الوظيفي', 'تاريخ التعيين', 'الحالة', 'البنك', 'الآيبان IBAN', 'رمز السويفت SWIFT/BIC', 'الراتب الأساسي', 'بدل سكن', 'بدل نقل', 'بدلات أخرى', 'بدلات أخرى غير خاضعة لـ GOSI', 'إجمالي الراتب'];
    const rows = filteredEmployees.map(e => [
      `"${e.employeeNo}"`,
      `"${e.firstNameAr} ${e.lastNameAr}"`,
      `"${e.nationalIdOrIqama}"`,
      e.nationality === 'SAUDI' ? 'سعودي' : 'غير سعودي',
      e.nationality === 'SAUDI' ? (e.gosiEnabled === false ? 'غير خاضع' : `${e.saudiGosiPaymentMode === 'COMPANY_FULL' ? 'الشركة كاملًا' : 'مشترك'} (${((e.gosiEmployeeRate ?? company.calculationRules?.saudiGosiEmployeeRate ?? 0.0975) * 100).toFixed(2)}% / ${((e.gosiEmployerRate ?? company.calculationRules?.saudiGosiEmployerRate ?? 0.1175) * 100).toFixed(2)}%)`) : 'غير مطبق',
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

  const confirmEmployeeImport = () => {
    if (!importPreview.valid.length) return;
    if (onBulkImportEmployees) onBulkImportEmployees(importPreview.valid);
    else importPreview.valid.forEach(handleSave);
    setImportSheet(null);
    setImportMapping({});
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
            <option value="SUSPENDED">{language === 'ar' ? 'معلق الراتب (موقوف)' : 'Salary suspended'}</option>
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
                      ) : <div className="text-[9px] text-amber-600 font-semibold">IBAN غير مكتمل</div>}
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
                            if (onDeleteEmployee) onDeleteEmployee(emp.id);
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-6xl w-full max-h-[92vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl"><FileSpreadsheet className="w-5 h-5" /></div>
                <div>
                  <h3 className="font-bold">معاينة استيراد الموظفين</h3>
                  <p className="text-xs text-slate-400">{importSheet.fileName} — صف العناوين {importSheet.headerRow}</p>
                </div>
              </div>
              <button onClick={() => setImportSheet(null)} className="p-2 hover:bg-white/10 rounded-xl cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-emerald-800"><b>{importPreview.valid.length}</b> صف صالح للاستيراد</div>
                <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-sky-800"><b>{importPreview.adjusted}</b> رقم مكرر تم تصحيحه</div>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-amber-800"><b>{importPreview.incomplete}</b> موظف يحتاج استكمال بيانات</div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-slate-700"><b>{importPreview.ignored}</b> صف غير موظف تم تجاهله</div>
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-rose-800"><b>{importPreview.errors.length}</b> صف به أخطاء</div>
              </div>

              {importPreview.duplicates > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  تم تجاهل {importPreview.duplicates} موظف موجود مسبقًا بنفس الإقامة أو IBAN.
                </div>
              )}

              <div>
                <h4 className="font-bold text-sm text-slate-900 mb-2">مطابقة أعمدة الشيت</h4>
                <p className="text-xs text-slate-500 mb-3">راجع المطابقة التلقائية. في نموذجك يتم اقتراح cards كاسم البنك وCASH كرمز SWIFT.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {importSheet.columns.map(column => (
                    <label key={column.index} className="rounded-xl border border-slate-200 p-2 bg-slate-50">
                      <span className="block text-[11px] font-semibold text-slate-600 truncate mb-1" title={column.header}>{column.header}</span>
                      <select
                        value={importMapping[column.index] || ''}
                        onChange={(event) => setImportMapping(prev => ({ ...prev, [column.index]: event.target.value as EmployeeImportField | '' }))}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                      >
                        <option value="">تجاهل العمود</option>
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
                  <b>أول الأخطاء:</b> {importPreview.errors.slice(0, 5).join(' • ')}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button onClick={() => setImportSheet(null)} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold cursor-pointer">إلغاء</button>
              <button
                onClick={confirmEmployeeImport}
                disabled={!importPreview.valid.length}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                استيراد {importPreview.valid.length} موظف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    {editingEmployee ? 'تعديل بيانات الموظف وسلم الراتب' : 'إضافة موظف جديد للمنشأة'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    المنشأة: {company.nameAr}
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
              
              {/* Section 1: Basic Identity */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>البيانات الشخصية والهوية</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الرقم الوظيفي *</label>
                    <input
                      type="text"
                      required
                      value={formData.employeeNo || ''}
                      onChange={(e) => setFormData({ ...formData, employeeNo: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الهوية الوطنية / الإقامة *</label>
                    <input
                      type="text"
                      required
                      value={formData.nationalIdOrIqama || ''}
                      onChange={(e) => setFormData({ ...formData, nationalIdOrIqama: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الاسم الأول (بالعربي) *</label>
                    <input
                      type="text"
                      required
                      value={formData.firstNameAr || ''}
                      onChange={(e) => setFormData({ ...formData, firstNameAr: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">اسم العائلة (بالعربي) *</label>
                    <input
                      type="text"
                      required
                      value={formData.lastNameAr || ''}
                      onChange={(e) => setFormData({ ...formData, lastNameAr: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الجنسية *</label>
                    <select
                      value={formData.nationality || 'SAUDI'}
                      onChange={(e) => {
                        const isSa = e.target.value === 'SAUDI';
                        setFormData({ 
                          ...formData, 
                          nationality: e.target.value as NationalityType,
                          gosiEnabled: true,
                          country: isSa ? 'المملكة العربية السعودية' : (formData.country === 'المملكة العربية السعودية' ? 'مصر' : formData.country)
                        });
                      }}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="SAUDI">سعودي (خاضع لاشتراك التأمينات GOSI)</option>
                      <option value="NON_SAUDI">غير سعودي (مخاطر مهنية فقط)</option>
                    </select>
                  </div>

                  {formData.nationality === 'SAUDI' && (
                    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 rounded-2xl bg-emerald-50/60 border border-emerald-200">
                      <label className="sm:col-span-4 flex items-center gap-2 font-bold text-emerald-900">
                        <input type="checkbox" checked={formData.gosiEnabled !== false} onChange={(e) => setFormData({ ...formData, gosiEnabled: e.target.checked })} />
                        تطبيق التأمينات الاجتماعية على الموظف
                      </label>
                      <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">طريقة تحمل اشتراك GOSI</label>
                      <select
                        disabled={formData.gosiEnabled === false}
                        value={formData.saudiGosiPaymentMode || 'SHARED'}
                        onChange={(e) => setFormData({ ...formData, saudiGosiPaymentMode: e.target.value as 'SHARED' | 'COMPANY_FULL' })}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                      >
                        <option value="SHARED">عادي: حصة على الموظف وحصة على الشركة</option>
                        <option value="COMPANY_FULL">الشركة تتحمل الاشتراك كاملًا دون خصم الموظف</option>
                      </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">نسبة الموظف %</label>
                        <input type="number" min="0" max="100" step="0.01" disabled={formData.gosiEnabled === false} value={((formData.gosiEmployeeRate ?? company.calculationRules?.saudiGosiEmployeeRate ?? 0.0975) * 100)} onChange={(e) => setFormData({ ...formData, gosiEmployeeRate: Math.max(0, Number(e.target.value) || 0) / 100 })} className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">نسبة الشركة %</label>
                        <input type="number" min="0" max="100" step="0.01" disabled={formData.gosiEnabled === false} value={((formData.gosiEmployerRate ?? company.calculationRules?.saudiGosiEmployerRate ?? 0.1175) * 100)} onChange={(e) => setFormData({ ...formData, gosiEmployerRate: Math.max(0, Number(e.target.value) || 0) / 100 })} className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-mono" />
                      </div>
                      <div className="text-[11px] text-emerald-800 self-end pb-2">تُطبق النسب على الأساسي + بدل السكن حتى الحد الأعلى للمنشأة.</div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الدولة</label>
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
                  <span>بيانات الوظيفة والتعيين</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">القسم *</label>
                    <input
                      type="text"
                      list="company-departments-list"
                      required
                      placeholder="اختر أو اكتب اسم القسم..."
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
                    <label className="block text-xs font-semibold text-slate-700 mb-1">المسمى الوظيفي *</label>
                    <input
                      type="text"
                      required
                      value={formData.jobTitle || ''}
                      onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">مركز التكلفة *</label>
                    <select
                      value={formData.costCenterId || ''}
                      onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    >
                      {company.costCenters.map(cc => (
                        <option key={cc.id} value={cc.id}>{cc.code} - {cc.nameAr}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ التعيين</label>
                    <input
                      type="date"
                      value={formData.hireDate || ''}
                      onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">بداية استحقاق الراتب</label>
                    <input
                      type="date"
                      value={formData.salaryStartDate || ''}
                      onChange={(e) => setFormData({ ...formData, salaryStartDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الحالة الوظيفية</label>
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
                      <option value="ACTIVE">على رأس العمل (Active)</option>
                      <option value="SUSPENDED">تعليق الراتب (Suspended)</option>
                      <option value="ON_LEAVE">إجازة (On Leave)</option>
                      <option value="TERMINATED">منتهي الخدمة (Terminated)</option>
                      <option value="ABSCONDED">هروب — تعليق واستبعاد الراتب (Absconded)</option>
                    </select>
                  </div>
                </div>

                {/* Suspension Details if Suspended */}
                {formData.status === 'SUSPENDED' && (
                  <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-amber-900 mb-1">سبب تعليق الراتب</label>
                      <input
                        type="text"
                        value={formData.suspensionReason || ''}
                        onChange={(e) => setFormData({ ...formData, suspensionReason: e.target.value })}
                        placeholder="مثال: إجازة استثنائية بدون راتب، تحقيق إداري..."
                        className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {formData.status === 'TERMINATED' && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-blue-900 mb-1">سبب تصفية الراتب *</label>
                      <select required value={formData.employmentEndReason || ''} onChange={(e) => setFormData({ ...formData, employmentEndReason: e.target.value as Employee['employmentEndReason'] })} className="w-full px-3 py-2 text-xs bg-white border border-blue-300 rounded-lg">
                        <option value="">-- اختر السبب --</option>
                        <option value="SPONSOR_TRANSFER">نقل كفالة</option>
                        <option value="FINAL_EXIT">خروج نهائي</option>
                        <option value="OTHER">انتهاء خدمة آخر</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-blue-900 mb-1">تاريخ النقل / الخروج النهائي *</label>
                      <input type="date" required value={formData.terminationDate || ''} onChange={(e) => setFormData({ ...formData, terminationDate: e.target.value })} className="w-full px-3 py-2 text-xs bg-white border border-blue-300 rounded-lg" />
                    </div>
                    <p className="sm:col-span-2 text-[11px] text-blue-800">سيحسب المسير الراتب حتى هذا التاريخ شاملًا، ويستبعد الموظف من المسيرات التالية.</p>
                  </div>
                )}

                {formData.status === 'ABSCONDED' && (
                  <div className="mt-3 p-3 bg-rose-50 rounded-xl border border-rose-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-rose-900 mb-1">تاريخ تسجيل الهروب *</label>
                      <input type="date" required value={formData.terminationDate || ''} onChange={(e) => setFormData({ ...formData, terminationDate: e.target.value, employmentEndReason: 'ABSCONDED', suspensionReason: 'هروب' })} className="w-full px-3 py-2 text-xs bg-white border border-rose-300 rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-rose-900 mb-1">ملاحظات / مرجع البلاغ</label>
                      <input type="text" value={formData.suspensionReason || ''} onChange={(e) => setFormData({ ...formData, suspensionReason: e.target.value })} className="w-full px-3 py-2 text-xs bg-white border border-rose-300 rounded-lg" />
                    </div>
                    <p className="sm:col-span-2 text-[11px] text-rose-800">سيُنقل الموظف إلى قائمة العمالة الهاربة ويُستبعد راتبه بالكامل من أي مسير جديد.</p>
                  </div>
                )}
              </div>

              {/* Section 3: Bank, IBAN & SWIFT Code */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>الحساب البنكي وحماية الأجور (WPS) وبيانات السويفت (SWIFT/BIC)</span>
                  </h4>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-semibold">
                    مطابق لمعايير البنك المركزي السعودي (SAMA)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  
                  {/* Bank Name */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">اسم البنك *</label>
                      <span className="text-[10px] text-slate-400">البنوك المعتمدة</span>
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
                      <option value="">-- اختر البنك --</option>
                      {getBankDefinitions(company.bankDefinitions).filter(b => b.isActive !== false).map(b => (
                        <option key={b.ibanBankCode} value={b.ibanBankCode}>
                          {language === 'en' ? b.nameEn || b.nameAr : b.nameAr} ({b.swiftCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* IBAN */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">رقم الآيبان (IBAN) *</label>
                      {formData.bankIban && (
                        validateSaudiIBAN(formData.bankIban) ? (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                            <CheckCircle className="w-3 h-3" /> آيبان صحيح
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
                      <label className="block text-xs font-semibold text-slate-700">رمز السويفت (SWIFT / BIC)</label>
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
                            alert('يرجى تحديد اسم البنك أو إدخال رقم آيبان سعودي صالح ليتم التوليد التلقائي لرمز السويفت');
                          }
                        }}
                        className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 cursor-pointer"
                        title="توليد وتحديث رمز السويفت تلقائياً بناءً على البنك أو الآيبان"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>توليد تلقائي</span>
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder="مثال: RJHISARI أو NCBKSARI"
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
                            <CheckCircle className="w-2.5 h-2.5" /> رمز سويفت قياسي معتمد (ISO 9362)
                          </span>
                        ) : (
                          <span className="text-amber-600 font-semibold flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" /> الصيغة القياسية: 8 أو 11 حرفاً ورقم
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400">
                          يتولد تلقائياً من رقم الآيبان والبنك
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
                  <span>سلم الرواتب والبدلات الثابتة (بالريال السعودي)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الراتب الأساسي *</label>
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
                    <label className="block text-xs font-semibold text-slate-700 mb-1">بدل السكن</label>
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
                    <label className="block text-xs font-semibold text-slate-700 mb-1">بدل النقل</label>
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
                    <label className="block text-xs font-semibold text-slate-700 mb-1">بدلات أخرى ثابتة</label>
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
                    <label className="block text-xs font-semibold text-slate-700 mb-1">بدلات أخرى غير خاضعة لـ GOSI</label>
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
                  <span className="text-xs font-bold text-emerald-900">إجمالي الراتب الشهري الثابت:</span>
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
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  {editingEmployee ? 'حفظ التعديلات' : 'إضافة الموظف الآن'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
