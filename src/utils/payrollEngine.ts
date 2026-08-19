import { 
  Employee, 
  Company, 
  AttendanceRecord, 
  LoanSchedule, 
  PenaltyRecord, 
  PayrollRunItem 
} from '../types';
import { detectBankFromIBAN, getSwiftCodeFromBankName } from './security';

export interface EmployeeCalculationInput {
  employee: Employee;
  company: Company;
  periodMonth: string; // YYYY-MM
  attendanceRecords: AttendanceRecord[];
  activeLoans: LoanSchedule[];
  penalties: PenaltyRecord[];
}

export function calculateEmployeePayrollItem(input: EmployeeCalculationInput): PayrollRunItem {
  const { employee, company } = input;
  const attendanceRecords = input.attendanceRecords || [];
  const activeLoans = input.activeLoans || [];
  const penalties = input.penalties || [];
  const companyBank = detectBankFromIBAN(employee.bankIban, company.bankDefinitions);
  const effectiveBankName = companyBank?.nameAr || employee.bankName;
  const effectiveBankSwift = companyBank?.swiftCode || getSwiftCodeFromBankName(employee.bankName, company.bankDefinitions) || employee.bankSwiftCode;
  const rules = company.calculationRules || {
    dailyRateFormula: 'BASE_PLUS_HOUSING',
    hourlyRateDivisor: 8,
    workDaysDivisor: 30,
    delayGracePeriodMinutes: 15,
    delayDeductionMultiplier: 1.0,
    absenceDayMultiplier: 1.0,
    unpaidLeaveMultiplier: 1.0,
    overtimeStandardRate: 1.5,
    overtimeWeekendRate: 2.0,
    saudiGosiEmployeeRate: 0.0975,
    saudiGosiEmployerRate: 0.1175,
    nonSaudiGosiEmployerHazardRate: 0.02,
    saudiGosiMaxCap: 45000,
    roundingDecimals: 2,
  };

  const isSuspended = employee.status === 'SUSPENDED';
  const isTerminated = employee.status === 'TERMINATED';

  // Base Package
  const baseSalary = employee.salaryPackage.baseSalary || 0;
  const housingAllowance = employee.salaryPackage.housingAllowance || 0;
  const transportAllowance = employee.salaryPackage.transportAllowance || 0;
  const otherFixedAllowances = employee.salaryPackage.otherFixedAllowances || 0;
  const nonGosiOtherAllowances = employee.salaryPackage.nonGosiOtherAllowances || 0;
  
  const customAllowancesSum = (employee.salaryPackage.customAllowances || [])
    .reduce((sum, item) => sum + (item.amount || 0), 0);

  const customDeductionsSum = (employee.salaryPackage.customDeductions || [])
    .reduce((sum, item) => sum + (item.amount || 0), 0);

  // Daily & Hourly Rates
  let dailyBaseAmount = baseSalary;
  if (rules.dailyRateFormula === 'BASE_PLUS_FIXED') {
    dailyBaseAmount = baseSalary + housingAllowance + transportAllowance + otherFixedAllowances;
  } else if (rules.dailyRateFormula === 'BASE_PLUS_HOUSING') {
    dailyBaseAmount = baseSalary + housingAllowance;
  } else {
    dailyBaseAmount = baseSalary;
  }
  const dailyRate = dailyBaseAmount / (company.workDaysPerMonth || rules.workDaysDivisor || 30);
  const hourlyRate = dailyRate / (company.workHoursPerDay || rules.hourlyRateDivisor || 8);
  const minuteRate = hourlyRate / 60;

  // Attendance Aggregation
  let totalDelayMinutes = 0;
  let totalAbsenceDays = 0;
  let totalUnpaidLeaveDays = 0;
  let standardOvertimeHours = 0;
  let weekendOvertimeHours = 0;

  attendanceRecords.forEach((record) => {
    if (record.absence) {
      totalAbsenceDays += 1;
    } else if (record.unpaidLeave) {
      totalUnpaidLeaveDays += 1;
    } else {
      if (record.delayMinutes > 0) {
        if (record.delayMinutes > rules.delayGracePeriodMinutes) {
          totalDelayMinutes += (record.delayMinutes - rules.delayGracePeriodMinutes);
        }
      }
      if (record.overtimeHours > 0) {
        if (record.overtimeType === 'WEEKEND') {
          weekendOvertimeHours += record.overtimeHours;
        } else {
          standardOvertimeHours += record.overtimeHours;
        }
      }
    }
  });

  // Overtime Calculation
  const standardOvertimeAmount = standardOvertimeHours * hourlyRate * (rules.overtimeStandardRate || 1.5);
  const weekendOvertimeAmount = weekendOvertimeHours * hourlyRate * (rules.overtimeWeekendRate || 2.0);
  const totalOvertimeAmount = roundAmount(standardOvertimeAmount + weekendOvertimeAmount, rules.roundingDecimals);
  const totalOvertimeHours = standardOvertimeHours + weekendOvertimeHours;

  // Deductions from Attendance
  const delayDeduction = roundAmount(totalDelayMinutes * minuteRate * (rules.delayDeductionMultiplier || 1.0), rules.roundingDecimals);
  const absenceDeduction = roundAmount(totalAbsenceDays * dailyRate * (rules.absenceDayMultiplier || 1.0), rules.roundingDecimals);
  const unpaidLeaveDeduction = roundAmount(totalUnpaidLeaveDays * dailyRate * (rules.unpaidLeaveMultiplier || 1.0), rules.roundingDecimals);

  // Loans deduction
  let loanDeduction = 0;
  activeLoans.forEach(loan => {
    if (loan.status === 'ACTIVE' && loan.remainingAmount > 0) {
      loanDeduction += Math.min(loan.monthlyInstallment, loan.remainingAmount);
    }
  });
  loanDeduction = roundAmount(loanDeduction, rules.roundingDecimals);

  // Penalties
  let penaltiesDeduction = 0;
  penalties.forEach(penalty => {
    penaltiesDeduction += penalty.amount;
  });
  penaltiesDeduction = roundAmount(penaltiesDeduction, rules.roundingDecimals);

  // GOSI (Social Insurance) Calculation
  let gosiEmployeeShare = 0;
  let gosiEmployerShare = 0;

  // GOSI base is base + housing, capped at 45,000 SAR
  const gosiBaseRaw = baseSalary + housingAllowance;
  const gosiSubjectAmount = Math.min(gosiBaseRaw, rules.saudiGosiMaxCap || 45000);

  if (employee.nationality === 'SAUDI') {
    const employeeSubscription = roundAmount(gosiSubjectAmount * (rules.saudiGosiEmployeeRate || 0.0975), rules.roundingDecimals);
    const employerSubscription = roundAmount(gosiSubjectAmount * (rules.saudiGosiEmployerRate || 0.1175), rules.roundingDecimals);
    if (employee.saudiGosiPaymentMode === 'COMPANY_FULL') {
      gosiEmployeeShare = 0;
      gosiEmployerShare = roundAmount(employeeSubscription + employerSubscription, rules.roundingDecimals);
    } else {
      gosiEmployeeShare = employeeSubscription;
      gosiEmployerShare = employerSubscription;
    }
  } else {
    // Non-Saudi: No employee share, 2% employer occupational hazard share
    gosiEmployeeShare = 0;
    gosiEmployerShare = roundAmount(gosiSubjectAmount * (rules.nonSaudiGosiEmployerHazardRate || 0.02), rules.roundingDecimals);
  }

  // If employee is suspended or terminated, handle accordingly
  let effectiveBaseSalary = baseSalary;
  let effectiveHousing = housingAllowance;
  let effectiveTransport = transportAllowance;
  let effectiveOtherFixed = otherFixedAllowances;
  let effectiveNonGosiOther = nonGosiOtherAllowances;

  if (isSuspended) {
    // Suspension: 0 base payout unless specific allowance rule
    effectiveBaseSalary = 0;
    effectiveHousing = 0;
    effectiveTransport = 0;
    effectiveOtherFixed = 0;
    effectiveNonGosiOther = 0;
  }

  const totalOtherAllowances = effectiveOtherFixed + effectiveNonGosiOther + customAllowancesSum;
  const bonuses = 0;

  const totalGrossSalary = roundAmount(
    effectiveBaseSalary + effectiveHousing + effectiveTransport + totalOtherAllowances + totalOvertimeAmount + bonuses,
    rules.roundingDecimals
  );

  const totalDeductions = roundAmount(
    delayDeduction + absenceDeduction + unpaidLeaveDeduction + gosiEmployeeShare + loanDeduction + penaltiesDeduction + customDeductionsSum,
    rules.roundingDecimals
  );

  const netSalary = roundAmount(Math.max(0, totalGrossSalary - totalDeductions), rules.roundingDecimals);
  const totalCompanyBurden = roundAmount(totalGrossSalary + gosiEmployerShare, rules.roundingDecimals);

  // Warnings
  const warningFlags: string[] = [];
  if (isSuspended) {
    warningFlags.push('الموظف في حالة تعليق راتب');
  }
  if (!employee.bankIban || employee.bankIban.trim().length < 15) {
    warningFlags.push('رقم الآيبان (IBAN) مفقود أو غير مكتمل');
  }
  if (totalGrossSalary - totalDeductions < 0) {
    warningFlags.push('الاستقطاعات تتجاوز إجمالي المستحقات');
  }
  // Saudi Labor Law: Loans deduction should not exceed 33% of gross salary
  if (totalGrossSalary > 0 && loanDeduction > (totalGrossSalary * 0.33)) {
    warningFlags.push('قسط السلفة يتجاوز الثلث (33%) من إجمالي الراتب');
  }
  if (totalAbsenceDays >= 5) {
    warningFlags.push(`غياب مرتفع (${totalAbsenceDays} أيام)`);
  }

  return {
    id: `item-${employee.id}-${input.periodMonth}`,
    payrollRunId: '',
    employeeId: employee.id,
    employeeNo: employee.employeeNo,
    employeeName: `${employee.firstNameAr} ${employee.lastNameAr}`,
    employeeNameEn: `${employee.firstNameEn || ''} ${employee.lastNameEn || ''}`.trim(),
    nationalIdOrIqama: employee.nationalIdOrIqama,
    department: employee.department,
    costCenterId: employee.costCenterId,
    nationality: employee.nationality,
    bankIban: employee.bankIban,
    bankName: effectiveBankName,
    bankSwiftCode: effectiveBankSwift,
    
    baseSalary: effectiveBaseSalary,
    housingAllowance: effectiveHousing,
    transportAllowance: effectiveTransport,
    otherAllowances: totalOtherAllowances,
    nonGosiAllowances: effectiveNonGosiOther,
    overtimeAmount: totalOvertimeAmount,
    overtimeHours: totalOvertimeHours,
    bonuses,
    totalGrossSalary,

    delayMinutes: totalDelayMinutes,
    delayDeduction,
    absenceDays: totalAbsenceDays,
    absenceDeduction,
    unpaidLeaveDays: totalUnpaidLeaveDays,
    unpaidLeaveDeduction,
    gosiEmployeeShare,
    loanDeduction,
    penaltiesDeduction,
    otherDeductions: customDeductionsSum,
    totalDeductions,

    netSalary,
    gosiEmployerShare,
    totalCompanyBurden,
    saudiGosiPaymentMode: employee.saudiGosiPaymentMode || 'SHARED',
    manualAddition: 0,
    manualDeduction: 0,

    isSuspended,
    warningFlags,
  };
}

export function roundAmount(val: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

export function formatSAR(val: number): string {
  return new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0);
}

export function formatNumber(val: number, decimals: number = 2): string {
  return new Intl.NumberFormat('ar-SA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val || 0);
}
