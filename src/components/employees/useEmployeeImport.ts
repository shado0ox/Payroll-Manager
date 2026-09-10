import { useMemo, useRef, useState } from 'react';
import { Company, Employee, EmploymentStatus } from '../../types';
import { detectBankFromIBAN, getSwiftCodeFromBankName, validateSaudiIBAN } from '../../utils/security';
import {
  EmployeeImportField,
  ParsedEmployeeSheet,
  parseEmployeeSheet,
  parseMoney,
} from '../../utils/employeeImport';

interface UseEmployeeImportOptions {
  company: Company;
  companyEmployees: Employee[];
  onBulkImportEmployees?: (employees: Employee[]) => Promise<boolean | void> | boolean | void;
  saveEmployee: (employee: Employee) => Promise<void> | void;
}

export const useEmployeeImport = ({
  company,
  companyEmployees,
  onBulkImportEmployees,
  saveEmployee: handleSave,
}: UseEmployeeImportOptions) => {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importSheet, setImportSheet] = useState<ParsedEmployeeSheet | null>(null);
  const [importMapping, setImportMapping] = useState<Record<number, EmployeeImportField | ''>>({});
  const [importError, setImportError] = useState('');
  const [isParsingImport, setIsParsingImport] = useState(false);
  const [isImportingEmployees, setIsImportingEmployees] = useState(false);

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

  return {
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
  };
};

