import { Company, PayrollRun, JournalBatch, JournalLine, PayrollPaymentBatch } from '../types';
import { roundAmount } from './payrollEngine';

export function generatePayrollJournalBatch(company: Company, payrollRun: PayrollRun): JournalBatch {
  const accounts = company.chartOfAccounts;
  const lines: JournalLine[] = [];
  const costCenters = company?.costCenters || [];

  // Group items by Cost Center for detailed tracking
  const costCenterMap = new Map<string, {
    baseSalary: number;
    housing: number;
    transport: number;
    overtime: number;
    otherAllowances: number;
    gosiEmployer: number;
  }>();

  // Initialize cost centers
  costCenters.forEach(cc => {
    costCenterMap.set(cc.id, {
      baseSalary: 0,
      housing: 0,
      transport: 0,
      overtime: 0,
      otherAllowances: 0,
      gosiEmployer: 0,
    });
  });

  // Default fallback if cost center not matched
  const defaultCCId = costCenters[0]?.id || 'CC-DEFAULT';
  if (!costCenterMap.has(defaultCCId)) {
    costCenterMap.set(defaultCCId, {
      baseSalary: 0,
      housing: 0,
      transport: 0,
      overtime: 0,
      otherAllowances: 0,
      gosiEmployer: 0,
    });
  }

  const items = payrollRun?.items || (payrollRun as any)?.records || [];
  items.forEach((item: any) => {
    const ccId = costCenterMap.has(item.costCenterId) ? item.costCenterId : defaultCCId;
    const bucket = costCenterMap.get(ccId)!;
    bucket.baseSalary += Number(item.baseSalary || 0);
    bucket.housing += Number(item.housingAllowance || 0);
    bucket.transport += Number(item.transportAllowance || 0);
    bucket.overtime += Number(item.overtimeAmount || 0);
    bucket.otherAllowances += Number((item.otherAllowances || 0) + (item.bonuses || 0));
    bucket.gosiEmployer += Number(item.gosiEmployerShare || 0);
  });

  // 1. DEBITS: Expenses per Cost Center
  costCenterMap.forEach((data, ccId) => {
    const cc = costCenters.find(c => c.id === ccId) || {
      code: 'CC-GEN',
      nameAr: 'المركز العام'
    };

    if (data.baseSalary > 0) {
      lines.push({
        id: `line-debit-base-${ccId}`,
        accountCode: accounts.salariesExpenseAccount || '5101',
        accountNameAr: 'مصروف الرواتب الأساسية',
        descriptionAr: `استحقاق رواتب شهر ${payrollRun.periodMonth} - ${cc.nameAr}`,
        debit: roundAmount(data.baseSalary),
        credit: 0,
        costCenterCode: cc.code,
        costCenterName: cc.nameAr,
      });
    }

    if (data.housing > 0) {
      lines.push({
        id: `line-debit-housing-${ccId}`,
        accountCode: accounts.housingAllowanceAccount || '5102',
        accountNameAr: 'مصروف بدل سكن',
        descriptionAr: `استحقاق بدل سكن شهر ${payrollRun.periodMonth} - ${cc.nameAr}`,
        debit: roundAmount(data.housing),
        credit: 0,
        costCenterCode: cc.code,
        costCenterName: cc.nameAr,
      });
    }

    if (data.transport > 0) {
      lines.push({
        id: `line-debit-trans-${ccId}`,
        accountCode: accounts.transportAllowanceAccount || '5103',
        accountNameAr: 'مصروف بدل نقل وتوصيل',
        descriptionAr: `استحقاق بدل نقل شهر ${payrollRun.periodMonth} - ${cc.nameAr}`,
        debit: roundAmount(data.transport),
        credit: 0,
        costCenterCode: cc.code,
        costCenterName: cc.nameAr,
      });
    }

    if (data.overtime > 0) {
      lines.push({
        id: `line-debit-ot-${ccId}`,
        accountCode: accounts.overtimeExpenseAccount || '5104',
        accountNameAr: 'مصروف ساعات العمل الإضافي',
        descriptionAr: `استحقاق العمل الإضافي شهر ${payrollRun.periodMonth} - ${cc.nameAr}`,
        debit: roundAmount(data.overtime),
        credit: 0,
        costCenterCode: cc.code,
        costCenterName: cc.nameAr,
      });
    }

    if (data.otherAllowances > 0) {
      lines.push({
        id: `line-debit-other-${ccId}`,
        accountCode: accounts.otherAllowancesExpenseAccount || '5105',
        accountNameAr: 'مصروف بدلات ومكافآت أخرى',
        descriptionAr: `استحقاق بدلات أخرى شهر ${payrollRun.periodMonth} - ${cc.nameAr}`,
        debit: roundAmount(data.otherAllowances),
        credit: 0,
        costCenterCode: cc.code,
        costCenterName: cc.nameAr,
      });
    }

    if (data.gosiEmployer > 0) {
      lines.push({
        id: `line-debit-gosi-emp-${ccId}`,
        accountCode: accounts.gosiEmployerExpenseAccount || '5106',
        accountNameAr: 'مصروف التأمينات الاجتماعية - حصة المنشأة',
        descriptionAr: `حصة الشركة في التأمينات شهر ${payrollRun.periodMonth} - ${cc.nameAr}`,
        debit: roundAmount(data.gosiEmployer),
        credit: 0,
        costCenterCode: cc.code,
        costCenterName: cc.nameAr,
      });
    }
  });

  // Deductions that reduce expenses or go to liability offsets
  const totalAttendanceDeductions = roundAmount(
    payrollRun.totalAbsenceDeductions + payrollRun.totalDelayDeductions
  );

  // 2. CREDITS: Liabilities & Payables
  // A. Net Salaries Payable
  if (payrollRun.totalNetSalaries > 0) {
    lines.push({
      id: 'line-cred-salaries-payable',
      accountCode: accounts.salariesPayableAccount || '2101',
      accountNameAr: 'مستحقات الرواتب والأجور (صافي المستحق للموظفين)',
      descriptionAr: `صافي رواتب الموظفين المستحقة لشهر ${payrollRun.periodMonth}`,
      debit: 0,
      credit: roundAmount(payrollRun.totalNetSalaries),
    });
  }

  // B. Total GOSI Payable (Employee share + Employer share)
  const totalGosiLiability = roundAmount(payrollRun.totalGosiEmployee + payrollRun.totalGosiEmployer);
  if (totalGosiLiability > 0) {
    lines.push({
      id: 'line-cred-gosi-payable',
      accountCode: accounts.gosiPayableAccount || '2102',
      accountNameAr: 'مستحقات المؤسسة العامة للتأمينات الاجتماعية',
      descriptionAr: `مستحقات التأمينات (حصة موظفين ${payrollRun.totalGosiEmployee} + حصة منشأة ${payrollRun.totalGosiEmployer}) لشهر ${payrollRun.periodMonth}`,
      debit: 0,
      credit: totalGosiLiability,
    });
  }

  // C. Loans Repayment / Advances Offset
  if (payrollRun.totalLoanDeductions > 0) {
    lines.push({
      id: 'line-cred-loans',
      accountCode: accounts.employeeAdvancesAccount || '1105',
      accountNameAr: 'ذمم وسلف الموظفين المستردة',
      descriptionAr: `استقطاع أقساط سلف الموظفين لشهر ${payrollRun.periodMonth}`,
      debit: 0,
      credit: roundAmount(payrollRun.totalLoanDeductions),
    });
  }

  // D. Penalties & Attendance Deductions (Revenue / Reduction of Expenses / Penalty Fund)
  const totalPenaltiesAndPenalties = roundAmount(
    payrollRun.totalPenalties + totalAttendanceDeductions
  );
  if (totalPenaltiesAndPenalties > 0) {
    lines.push({
      id: 'line-cred-penalties',
      accountCode: accounts.penaltiesPayableAccount || '2105',
      accountNameAr: 'أمانات الجزاءات والخصومات الإدارية',
      descriptionAr: `خصومات الغياب والتأخير والجزاءات لشهر ${payrollRun.periodMonth}`,
      debit: 0,
      credit: totalPenaltiesAndPenalties,
    });
  }

  // Calculate totals and ensure balancing
  let totalDebit = roundAmount(lines.reduce((sum, l) => sum + (l.debit || 0), 0));
  let totalCredit = roundAmount(lines.reduce((sum, l) => sum + (l.credit || 0), 0));

  // If there is minor rounding variance (e.g. 0.01 SAR), adjust the first credit or debit line
  const diff = roundAmount(totalDebit - totalCredit);
  if (Math.abs(diff) > 0 && Math.abs(diff) < 0.1 && lines.length > 0) {
    const targetLine = lines.find(l => l.credit > 0) || lines[0];
    if (targetLine.credit > 0) {
      targetLine.credit = roundAmount(targetLine.credit + diff);
      totalCredit = roundAmount(lines.reduce((sum, l) => sum + (l.credit || 0), 0));
    }
  }

  return {
    id: `batch-${payrollRun.id}`,
    companyId: company.id,
    payrollRunId: payrollRun.id,
    periodMonth: payrollRun.periodMonth,
    batchNumber: `JV-${payrollRun.periodMonth.replace('-', '')}-${company.crNumber.slice(-4) || '001'}`,
    date: payrollRun.endDate || new Date().toISOString().split('T')[0],
    description: `قيد استحقاق رواتب وأجور موظفي (${company.nameAr}) لشهر ${payrollRun.periodMonth}`,
    totalDebit,
    totalCredit,
    status: 'DRAFT',
    lines,
  };
}

export function generatePaymentJournalBatch(company: Company, payrollRun: PayrollRun, paymentBatch?: PayrollPaymentBatch): JournalBatch {
  const accounts = company.chartOfAccounts;
  const lines: JournalLine[] = [];
  const paidBatches = payrollRun.paymentBatches?.filter(batch => batch.status === 'PAID') || [];
  const paymentAmount = roundAmount(paymentBatch
    ? paymentBatch.totalAmount
    : payrollRun.paymentBatches?.length
      ? paidBatches.reduce((sum, batch) => sum + batch.totalAmount, 0)
      : payrollRun.totalNetSalaries);
  const reference = paymentBatch?.batchNumber || `مسير ${payrollRun.periodMonth}`;
  const journalDate = paymentBatch?.paymentDate || paymentBatch?.scheduledDate || new Date().toISOString().split('T')[0];

  // Debit: Salaries Payable
  lines.push({
    id: `line-pay-debit-payable`,
    accountCode: accounts.salariesPayableAccount || '2101',
    accountNameAr: 'مستحقات الرواتب والأجور',
    descriptionAr: `صرف رواتب شهر ${payrollRun.periodMonth} - دفعة ${reference}`,
    debit: paymentAmount,
    credit: 0,
  });

  // Credit: Bank Account
  lines.push({
    id: `line-pay-cred-bank`,
    accountCode: accounts.bankAccount || '1010',
    accountNameAr: 'حساب البنك الجاري',
    descriptionAr: `تحويل رواتب شهر ${payrollRun.periodMonth} - دفعة ${reference}`,
    debit: 0,
    credit: paymentAmount,
  });

  return {
    id: `batch-payment-${paymentBatch?.id || payrollRun.id}`,
    companyId: company.id,
    payrollRunId: payrollRun.id,
    periodMonth: payrollRun.periodMonth,
    batchNumber: `PV-${paymentBatch?.batchNumber || `${payrollRun.periodMonth.replace('-', '')}-${company.crNumber.slice(-4) || '001'}`}`,
    date: journalDate,
    description: `قيد صرف وتحويل رواتب شهر ${payrollRun.periodMonth} - دفعة ${reference}`,
    totalDebit: paymentAmount,
    totalCredit: paymentAmount,
    status: 'DRAFT',
    lines,
  };
}
