import { Company, PayrollRun, JournalBatch, Employee, PayrollRunItem } from '../types';

/**
 * Downloads a string content as a UTF-8 file with BOM for perfect Arabic Excel rendering.
 */
export function downloadCsvFile(filename: string, csvContent: string): void {
  // UTF-8 BOM ensures Excel displays Arabic text properly
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates Qoyod-compatible Journal Entry CSV.
 * Standard Qoyod import columns:
 * Date, Description, AccountCode, AccountName, Debit, Credit, CostCenter, ContactName, Reference
 */
export function exportQoyodJournalCsv(batch: JournalBatch, company: Company): void {
  const headers = ['التاريخ', 'الوصف', 'رمز الحساب', 'اسم الحساب', 'مدين (Debit)', 'دائن (Credit)', 'مركز التكلفة', 'اسم جهة الاتصال', 'المرجع'];
  
  const rows = batch.lines.map(line => [
    `"${batch.date}"`,
    `"${line.descriptionAr || batch.description}"`,
    `"${line.accountCode}"`,
    `"${line.accountNameAr}"`,
    line.debit > 0 ? line.debit.toFixed(2) : '0.00',
    line.credit > 0 ? line.credit.toFixed(2) : '0.00',
    `"${line.costCenterCode || ''}"`,
    `"${line.contactName || company.nameAr}"`,
    `"${batch.batchNumber}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const filename = `Qoyod_Journal_${batch.periodMonth}_${company.nameEn || 'Company'}.csv`;
  downloadCsvFile(filename, csvContent);
}

/**
 * Generates Detailed Monthly Payroll Sheet CSV.
 */
export function exportPayrollSheetCsv(payrollRun: PayrollRun, company: Company): void {
  const headers = [
    'الرقم الوظيفي',
    'اسم الموظف',
    'الجنسية',
    'القسم',
    'رقم الآيبان (IBAN)',
    'البنك',
    'الراتب الأساسي',
    'بدل سكن',
    'بدل نقل',
    'بدلات ومكافآت أخرى',
    'ساعات الإضافي',
    'مبلغ الإضافي',
    'إجمالي المستحق (Gross)',
    'خصم التأخير',
    'خصم الغياب',
    'خصم إجازة بدون راتب',
    'تأمينات (الموظف)',
    'قسط السلفة',
    'جزاءات وخصومات أخرى',
    'إجمالي الاستقطاعات',
    'صافي الراتب (Net)',
    'تأمينات (حصة الشركة)',
    'إجمالي تكلفة الموظف'
  ];

  const rows = payrollRun.items.map(item => [
    `"${item.employeeNo}"`,
    `"${item.employeeName}"`,
    item.nationality === 'SAUDI' ? 'سعودي' : 'غير سعودي',
    `"${item.department}"`,
    `"${item.bankIban}"`,
    `"${item.bankName}"`,
    item.baseSalary.toFixed(2),
    item.housingAllowance.toFixed(2),
    item.transportAllowance.toFixed(2),
    item.otherAllowances.toFixed(2),
    item.overtimeHours.toFixed(1),
    item.overtimeAmount.toFixed(2),
    item.totalGrossSalary.toFixed(2),
    item.delayDeduction.toFixed(2),
    item.absenceDeduction.toFixed(2),
    item.unpaidLeaveDeduction.toFixed(2),
    item.gosiEmployeeShare.toFixed(2),
    item.loanDeduction.toFixed(2),
    item.penaltiesDeduction.toFixed(2),
    item.totalDeductions.toFixed(2),
    item.netSalary.toFixed(2),
    item.gosiEmployerShare.toFixed(2),
    item.totalCompanyBurden.toFixed(2)
  ]);

  const summaryRow = [
    '"الإجمالي العام"',
    `"${payrollRun.employeesCount} موظف"`,
    '""',
    '""',
    '""',
    '""',
    payrollRun.totalBaseSalaries.toFixed(2),
    '""',
    '""',
    payrollRun.totalAllowances.toFixed(2),
    '""',
    payrollRun.totalOvertime.toFixed(2),
    payrollRun.totalGrossSalaries.toFixed(2),
    payrollRun.totalDelayDeductions.toFixed(2),
    payrollRun.totalAbsenceDeductions.toFixed(2),
    '""',
    payrollRun.totalGosiEmployee.toFixed(2),
    payrollRun.totalLoanDeductions.toFixed(2),
    payrollRun.totalPenalties.toFixed(2),
    payrollRun.totalDeductions.toFixed(2),
    payrollRun.totalNetSalaries.toFixed(2),
    payrollRun.totalGosiEmployer.toFixed(2),
    payrollRun.totalCompanyCost.toFixed(2)
  ];

  const csvContent = [headers.join(','), ...rows.map(r => r.join(',')), summaryRow.join(',')].join('\r\n');
  const filename = `Payroll_Sheet_${payrollRun.periodMonth}_${company.nameEn || 'Company'}.csv`;
  downloadCsvFile(filename, csvContent);
}

/**
 * Generates Wages Protection System (WPS / Mudad / SAMA standard) Bank File format.
 */
export function exportWpsBankCsv(payrollRun: PayrollRun, company: Company): void {
  const headers = [
    'نوع السجل (Record Type)',
    'رقم الهوية / الإقامة',
    'اسم الموظف',
    'رقم الحساب البنكي / IBAN',
    'رمز البنك',
    'الراتب الأساسي',
    'بدل السكن',
    'بدلات أخرى',
    'إجمالي الاستقطاعات',
    'صافي الراتب المحول',
    'الرقم المرجعي للمنشأة'
  ];

  const rows = payrollRun.items
    .filter(i => !i.isSuspended && i.netSalary > 0)
    .map(item => [
      'ED', // Employee Detail
      `"${item.employeeId.slice(0, 10)}"`,
      `"${item.employeeName}"`,
      `"${item.bankIban}"`,
      `"${item.bankName}"`,
      item.baseSalary.toFixed(2),
      item.housingAllowance.toFixed(2),
      (item.transportAllowance + item.otherAllowances + item.overtimeAmount).toFixed(2),
      item.totalDeductions.toFixed(2),
      item.netSalary.toFixed(2),
      `"${company.crNumber}"`
    ]);

  const headerSummary = [
    'SCR', // Salary Control Record
    `"${company.crNumber}"`,
    `"${company.nameAr}"`,
    `"${payrollRun.endDate}"`,
    `"${payrollRun.periodMonth}"`,
    `"${payrollRun.items.filter(i => !i.isSuspended).length}"`,
    payrollRun.totalNetSalaries.toFixed(2),
    'SAR',
    `"WPS-${payrollRun.periodMonth}"`,
    '""',
    '""'
  ];

  const csvContent = [headers.join(','), headerSummary.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const filename = `WPS_Mudad_File_${payrollRun.periodMonth}_${company.crNumber}.csv`;
  downloadCsvFile(filename, csvContent);
}

/**
 * Generates GOSI Monthly Schedule CSV.
 */
export function exportGosiReportCsv(payrollRun: PayrollRun, company: Company): void {
  const headers = [
    'الرقم الوظيفي',
    'اسم المشترك',
    'الجنسية',
    'رقم الهوية / الإقامة',
    'الراتب الأساسي',
    'بدل السكن',
    'الأجر الخاضع للاشتراك',
    'حصة المشترك (Employee %)',
    'مبلغ استقطاع المشترك',
    'حصة المنشأة (Employer %)',
    'مبلغ حصة المنشأة',
    'إجمالي اشتراك التأمينات'
  ];

  const rows = payrollRun.items.map(item => {
    const isSaudi = item.nationality === 'SAUDI';
    const gosiBase = Math.min(item.baseSalary + item.housingAllowance, company.calculationRules.saudiGosiMaxCap);
    const totalGosi = item.gosiEmployeeShare + item.gosiEmployerShare;

    return [
      `"${item.employeeNo}"`,
      `"${item.employeeName}"`,
      isSaudi ? 'سعودي' : 'غير سعودي',
      '""',
      item.baseSalary.toFixed(2),
      item.housingAllowance.toFixed(2),
      gosiBase.toFixed(2),
      isSaudi ? `${((company.calculationRules.saudiGosiEmployeeRate || 0.0975) * 100).toFixed(2)}%` : '0%',
      item.gosiEmployeeShare.toFixed(2),
      isSaudi ? `${((company.calculationRules.saudiGosiEmployerRate || 0.1175) * 100).toFixed(2)}%` : `${((company.calculationRules.nonSaudiGosiEmployerHazardRate || 0.02) * 100).toFixed(2)}% (مخاطر)`,
      item.gosiEmployerShare.toFixed(2),
      totalGosi.toFixed(2)
    ];
  });

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const filename = `GOSI_Monthly_Report_${payrollRun.periodMonth}_${company.gosiEstablishmentNo}.csv`;
  downloadCsvFile(filename, csvContent);
}
