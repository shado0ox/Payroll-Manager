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
  const isAbsconded = employee.status === 'ABSCONDED';
  const isTerminated = employee.status === 'TERMINATED';

  const salaryDivisor = company.workDaysPerMonth || rules.workDaysDivisor || 30;
  const periodStart = `${input.periodMonth}-01`;
  const [periodYear, periodMonthNumber] = input.periodMonth.split('-').map(Number);
  const calendarLastDay = new Date(Date.UTC(periodYear, periodMonthNumber, 0)).getUTCDate();
  const periodEnd = `${input.periodMonth}-${String(calendarLastDay).padStart(2, '0')}`;
  const configuredSalaryStart = employee.salaryStartDate || employee.hireDate || periodStart;
  // A start date controls eligibility by month. Daily first-month proration is opt-in;
  // imported and existing monthly-paid employees receive their full salary by default.
  const salaryStart = configuredSalaryStart > periodEnd
    ? configuredSalaryStart
    : configuredSalaryStart.startsWith(input.periodMonth) && employee.prorateFirstMonth
      ? configuredSalaryStart
      : periodStart;
  const salaryEnd = isTerminated ? employee.terminationDate : undefined;
  let payableDays = salaryDivisor;
  if (salaryStart > periodEnd || (salaryEnd && salaryEnd < periodStart) || isSuspended || isAbsconded) {
    payableDays = 0;
  } else {
    const startDay = salaryStart.startsWith(input.periodMonth) ? Math.min(Number(salaryStart.slice(-2)), salaryDivisor) : 1;
    const endDay = salaryEnd?.startsWith(input.periodMonth) ? Math.min(Number(salaryEnd.slice(-2)), salaryDivisor) : salaryDivisor;
    payableDays = Math.max(0, endDay - startDay + 1);
  }
  const salaryProrationFactor = payableDays / salaryDivisor;

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
  const dailyRate = dailyBaseAmount / salaryDivisor;
  const hourlyRate = dailyRate / (company.workHoursPerDay || rules.hourlyRateDivisor || 8);
  const minuteRate = hourlyRate / 60;

  // Attendance Aggregation
  let totalDelayMinutes = 0;
  let totalAbsenceDays = 0;
  let totalUnpaidLeaveDays = 0;
  let standardOvertimeHours = 0;
  let weekendOvertimeHours = 0;

  attendanceRecords.forEach((record) => {
    const recordStart = record.date;
    const recordEnd = record.endDate || record.date;
    const servicePeriodStart = salaryStart > periodStart ? salaryStart : periodStart;
    const servicePeriodEnd = salaryEnd && salaryEnd < periodEnd ? salaryEnd : periodEnd;
    const overlapStart = recordStart > servicePeriodStart ? recordStart : servicePeriodStart;
    const overlapEnd = recordEnd < servicePeriodEnd ? recordEnd : servicePeriodEnd;
    const overlappedDays = overlapStart <= overlapEnd
      ? Math.floor((Date.parse(`${overlapEnd}T00:00:00Z`) - Date.parse(`${overlapStart}T00:00:00Z`)) / 86400000) + 1
      : 0;
    if (overlappedDays <= 0) return;
    if (record.absence) {
      totalAbsenceDays += overlappedDays;
    } else if (record.unpaidLeave) {
      totalUnpaidLeaveDays += overlappedDays;
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
  const gosiBaseRaw = (baseSalary + housingAllowance) * salaryProrationFactor;
  const gosiSubjectAmount = Math.min(gosiBaseRaw, rules.saudiGosiMaxCap || 45000);

  const gosiEnabled = employee.gosiEnabled !== false;
  const employeeGosiRate = employee.gosiEmployeeRate ?? rules.saudiGosiEmployeeRate ?? 0.0975;
  const employerGosiRate = employee.gosiEmployerRate ?? rules.saudiGosiEmployerRate ?? 0.1175;

  if (employee.nationality === 'SAUDI' && gosiEnabled) {
    const employeeSubscription = roundAmount(gosiSubjectAmount * employeeGosiRate, rules.roundingDecimals);
    const employerSubscription = roundAmount(gosiSubjectAmount * employerGosiRate, rules.roundingDecimals);
    if (employee.saudiGosiPaymentMode === 'COMPANY_FULL') {
      gosiEmployeeShare = 0;
      gosiEmployerShare = roundAmount(employeeSubscription + employerSubscription, rules.roundingDecimals);
    } else {
      gosiEmployeeShare = employeeSubscription;
      gosiEmployerShare = employerSubscription;
    }
  } else if (employee.nationality === 'NON_SAUDI' && gosiEnabled) {
    // Non-Saudi: No employee share, 2% employer occupational hazard share
    gosiEmployeeShare = 0;
    gosiEmployerShare = roundAmount(gosiSubjectAmount * (rules.nonSaudiGosiEmployerHazardRate || 0.02), rules.roundingDecimals);
  }

  // If employee is suspended or terminated, handle accordingly
  let effectiveBaseSalary = baseSalary * salaryProrationFactor;
  let effectiveHousing = housingAllowance * salaryProrationFactor;
  let effectiveTransport = transportAllowance * salaryProrationFactor;
  let effectiveOtherFixed = otherFixedAllowances * salaryProrationFactor;
  let effectiveNonGosiOther = nonGosiOtherAllowances * salaryProrationFactor;

  if (isSuspended || isAbsconded) {
    // Suspension: 0 base payout unless specific allowance rule
    effectiveBaseSalary = 0;
    effectiveHousing = 0;
    effectiveTransport = 0;
    effectiveOtherFixed = 0;
    effectiveNonGosiOther = 0;
  }

  const totalOtherAllowances = effectiveOtherFixed + effectiveNonGosiOther + (customAllowancesSum * salaryProrationFactor);
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
  if (isAbsconded) {
    warningFlags.push('عامل هارب — الراتب معلق ومستبعد من المسير');
  }
  if (isTerminated && employee.terminationDate?.startsWith(input.periodMonth)) {
    const reason = employee.employmentEndReason === 'SPONSOR_TRANSFER' ? 'نقل كفالة'
      : employee.employmentEndReason === 'FINAL_EXIT' ? 'خروج نهائي' : 'انتهاء خدمة';
    warningFlags.push(`تصفية ${reason} حتى ${employee.terminationDate} (${payableDays} يوم)`);
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
    payableDays,
    salaryProrationFactor,
    settlementDate: isTerminated ? employee.terminationDate : undefined,
    settlementReason: isTerminated ? employee.employmentEndReason : undefined,

    delayMinutes: totalDelayMinutes,
    delayDeduction,
    absenceDays: totalAbsenceDays,
    absenceDeduction,
    unpaidLeaveDays: totalUnpaidLeaveDays,
    unpaidLeaveDeduction,
    gosiEmployeeShare,
    gosiSubjectAmount: gosiEnabled ? gosiSubjectAmount : 0,
    gosiEmployeeRate: employeeGosiRate,
    gosiEmployerRate: employerGosiRate,
    gosiEnabled,
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

    isSuspended: isSuspended || isAbsconded,
    warningFlags,
  };
}

export function roundAmount(val: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

export function formatSAR(val: number): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0);
  return `${formatted} SR`;
}

export function formatNumber(val: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val || 0);
}
