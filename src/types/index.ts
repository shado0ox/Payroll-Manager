export type UserRole = 'ADMIN' | 'COMPANY_MANAGER' | 'OPERATIONS_MANAGER';
export type UserPermission =
  | 'VIEW_DASHBOARD'
  | 'MANAGE_COMPANY_PROFILE'
  | 'MANAGE_COMPANIES'
  | 'MANAGE_EMPLOYEES'
  | 'MANAGE_ATTENDANCE'
  | 'MANAGE_LOANS_PENALTIES'
  | 'MANAGE_PAYROLL'
  | 'APPROVE_PAYROLL'
  | 'REVERSE_PAYROLL_APPROVAL'
  | 'POST_PAYROLL'
  | 'CONFIRM_PAYROLL_PAYMENT'
  | 'REVERSE_PAYROLL_PAYMENT'
  | 'MANAGE_JOURNALS'
  | 'VIEW_REPORTS'
  | 'MANAGE_USERS'
  | 'RECEIVE_HR_EXPIRY_EMAILS'
  | 'VIEW_AUDIT_LOGS';

export interface UserAccount {
  id: string;
  username: string; // e.g. 'admin'
  password?: string; // write-only; never returned by the server
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  permissions?: UserPermission[];
  avatar?: string;
  companyIds: string[];
  employeeId?: string; // Optional link to employee profile
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  companyIds: string[];
  employeeId?: string; // If role is EMPLOYEE
}

export interface DepartmentInfo {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  headName?: string;
  description?: string;
}

export interface Company {
  id: string;
  companyCode: string; // e.g. '101', '102'
  nameAr: string;
  nameEn: string;
  subscriptionStatus?: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  trialEndsAt?: string | null;
  subscriptionEndsAt?: string | null;
  crNumber: string; // Commercial Registration
  taxNumber: string; // VAT
  gosiEstablishmentNo: string;
  bankName?: string;
  bankCode?: string;
  bankIban?: string;
  bankSwiftCode?: string;
  bankCustomerCode?: string;
  bankAgreementCode?: string;
  bankFundingAccount?: string;
  bankBranchCode?: string;
  laborOfficeEstablishmentNo?: string;
  chamberOfCommerceNo?: string;
  bankPayrollCode?: string;
  bankDefinitions?: CompanyBankDefinition[];
  logo?: string;
  currency: string;
  timezone: string;
  fiscalYearStartMonth: number;
  payrollCutoffDay: number; // e.g. 25th of month
  payrollPaymentDay: number; // e.g. 27th or last day of month
  monthlyBudgetCap?: number; // approved expected monthly payroll budget
  workDaysPerMonth: number; // standard 30 days
  dailyWorkHours: number; // 8 hours
  workHoursPerDay?: number;
  departments?: DepartmentInfo[];
  costCenters: CostCenter[];
  calculationRules: CompanyCalculationRules;
  chartOfAccounts: ChartOfAccountsMap;
}

export interface CompanyBankDefinition {
  ibanBankCode: string;
  nameAr: string;
  nameEn: string;
  swiftCode: string;
  isActive: boolean;
}

export interface CostCenter {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
}

export interface CompanyCalculationRules {
  dailyRateFormula: 'BASE_ONLY' | 'BASE_PLUS_FIXED' | 'BASE_PLUS_HOUSING';
  hourlyRateDivisor: number; // 8 hours standard
  workDaysDivisor?: number;
  delayGracePeriodMinutes: number; // e.g. 15 minutes
  delayCalculationMethod: 'EXACT_MINUTES' | 'BRACKET_TIERS'; // بالدقيقة أو شرائح
  delayDeductionMultiplier?: number;
  absenceDayMultiplier: number; // 1.0 = day for day, 1.5, etc.
  unpaidLeaveMultiplier: number; // 1.0
  // GOSI Saudi rates
  saudiGosiEmployeeRate: number; // 0.0975 (9.75% or 10%)
  saudiGosiEmployerRate: number; // 0.1175 (11.75% or 12%)
  saudiGosiMaxCap: number; // 45000 SAR
  saudiGosiBaseComponents: ('BASE' | 'HOUSING')[]; // الأساسي + السكن
  // GOSI Non-Saudi Occupational Hazards
  nonSaudiGosiEmployerHazardRate: number; // 0.02 (2%)
  // Overtime
  overtimeStandardRate: number; // 1.5 (150%)
  overtimeWeekendRate: number; // 2.0 (200%)
  // Rounding
  roundingDecimals: number; // 2 or 0 (nearest SAR)
}

export interface ChartOfAccountsMap {
  salariesExpenseAccount: string; // ح/ مصروف الرواتب
  housingAllowanceAccount: string; // ح/ بدل سكن
  transportAllowanceAccount: string; // ح/ بدل نقل
  overtimeExpenseAccount: string; // ح/ مصروف العمل الإضافي
  otherAllowancesExpenseAccount: string; // ح/ بدلات أخرى
  gosiEmployerExpenseAccount: string; // ح/ مصروف التأمينات - حصة المنشأة
  salariesPayableAccount: string; // ح/ مستحقات الرواتب والأجور
  gosiPayableAccount: string; // ح/ مستحقات التأمينات الاجتماعية
  employeeAdvancesAccount: string; // ح/ سلف وذمم الموظفين
  penaltiesPayableAccount: string; // ح/ خصومات وجزاءات
  bankAccount: string; // ح/ البنك
}

export type EmploymentStatus = 'ONBOARDING' | 'ACTIVE' | 'SUSPENDED' | 'ON_LEAVE' | 'TERMINATED' | 'ABSCONDED';
export type IqamaIssueStatus = 'PENDING' | 'ISSUED';
export type BankAccountStatus = 'PENDING' | 'READY';
export type EmployeeOnboardingStatus = 'NEW_ARRIVAL' | 'WAITING_IQAMA' | 'WAITING_BANK' | 'COMPLETE';
export type EmploymentEndReason = 'SPONSOR_TRANSFER' | 'FINAL_EXIT' | 'ABSCONDED' | 'OTHER';
export type NationalityType = 'SAUDI' | 'NON_SAUDI';

export interface SalaryComponent {
  id: string;
  nameAr: string;
  nameEn: string;
  type: 'ALLOWANCE' | 'DEDUCTION';
  taxable: boolean;
  gosiSubject: boolean;
  isFixed: boolean;
  defaultAmount?: number;
}

export interface EmployeeSalaryPackage {
  baseSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherFixedAllowances: number;
  nonGosiOtherAllowances?: number;
  customAllowances: { componentId: string; name: string; amount: number }[];
  customDeductions: { componentId: string; name: string; amount: number }[];
}

export interface Employee {
  id: string;
  companyId: string;
  employeeNo: string; // الرقم الوظيفي
  firstNameAr: string;
  lastNameAr: string;
  firstNameEn: string;
  lastNameEn: string;
  nationalIdOrIqama: string;
  nationality: NationalityType;
  country: string;
  email: string;
  phone: string;
  department: string;
  jobTitle: string;
  costCenterId: string;
  hireDate: string; // YYYY-MM-DD
  salaryStartDate: string; // YYYY-MM-DD
  prorateFirstMonth?: boolean; // Apply daily proration in the salary start month only when explicitly enabled
  entryDate?: string; // YYYY-MM-DD, non-Saudi arrival date
  entryNumber?: string; // Border/entry number before iqama issuance
  iqamaNumber?: string;
  iqamaIssueStatus?: IqamaIssueStatus;
  iqamaExpiryDate?: string; // YYYY-MM-DD
  contractStartDate?: string; // YYYY-MM-DD, Saudi employees
  contractEndDate?: string; // YYYY-MM-DD, Saudi employees
  bankAccountStatus?: BankAccountStatus;
  onboardingStatus?: EmployeeOnboardingStatus;
  terminationDate?: string;
  employmentEndReason?: EmploymentEndReason;
  status: EmploymentStatus;
  suspensionStartDate?: string;
  suspensionEndDate?: string;
  suspensionReason?: string;
  bankName: string;
  bankCode?: string;
  bankIban: string;
  bankSwiftCode?: string;
  gosiEnabled?: boolean;
  gosiEmployeeRate?: number;
  gosiEmployerRate?: number;
  saudiGosiPaymentMode?: 'SHARED' | 'COMPANY_FULL';
  dataWarnings?: string[];
  salaryPackage: EmployeeSalaryPackage;
}

export interface AttendanceRecord {
  id: string;
  companyId: string;
  employeeId: string;
  periodMonth: string; // YYYY-MM
  date: string;
  endDate?: string;
  daysCount?: number;
  delayMinutes: number;
  absence: boolean;
  unpaidLeave: boolean;
  overtimeHours: number;
  overtimeType: 'STANDARD' | 'WEEKEND';
  notes?: string;
}

export interface LeaveRequest {
  id: string;
  companyId: string;
  employeeId: string;
  type: 'ANNUAL' | 'SICK' | 'UNPAID' | 'EMERGENCY' | 'MATERNITY';
  startDate: string;
  endDate: string;
  daysCount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  isPaid: boolean;
  reason?: string;
}

export interface LoanAdjustment {
  id: string;
  amount: number; // positive increases the receivable, negative reduces it
  date: string;
  reason: string;
  createdAt: string;
  createdBy?: string;
}

export interface LoanSchedule {
  id: string;
  companyId: string;
  employeeId: string;
  totalAmount: number;
  monthlyInstallment: number;
  totalInstallments: number;
  remainingInstallments: number;
  remainingAmount: number;
  startDate: string; // YYYY-MM
  status: 'ACTIVE' | 'COMPLETED' | 'PAUSED';
  reason: string;
  adjustments?: LoanAdjustment[];
}

export interface PenaltyRecord {
  id: string;
  companyId: string;
  employeeId: string;
  periodMonth: string; // YYYY-MM
  date: string;
  reason: string;
  amount: number;
  appliedInPayroll: boolean;
}

export type TemporaryEarningType = 'COMMISSION' | 'BONUS' | 'INCENTIVE' | 'OTHER';

export interface TemporaryEarningRecord {
  id: string;
  companyId: string;
  employeeId: string;
  periodMonth: string; // Applied once to this payroll period only (YYYY-MM)
  date: string;
  type: TemporaryEarningType;
  amount: number;
  reason: string;
  appliedInPayroll: boolean;
}

export type PayrollRunStatus = 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'POSTED';
export type PayrollEntitlementStatus = 'PAYABLE' | 'HELD' | 'UNDER_SETTLEMENT' | 'SETTLED' | 'CANCELLED_WITH_DOCUMENT';

export interface PayrollRunItem {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  employeeNameEn?: string;
  nationalIdOrIqama?: string;
  department: string;
  costCenterId: string;
  nationality: NationalityType;
  bankIban: string;
  bankName: string;
  bankSwiftCode?: string;
  
  // Salary Earnings
  baseSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  nonGosiAllowances?: number;
  overtimeAmount: number;
  overtimeHours: number;
  bonuses: number;
  totalGrossSalary: number;
  payableDays?: number;
  salaryProrationFactor?: number;
  settlementDate?: string;
  settlementReason?: EmploymentEndReason;

  // Deductions
  delayMinutes: number;
  delayDeduction: number;
  absenceDays: number;
  absenceDeduction: number;
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: number;
  gosiEmployeeShare: number;
  gosiSubjectAmount?: number;
  gosiEmployeeRate?: number;
  gosiEmployerRate?: number;
  gosiEnabled?: boolean;
  loanDeduction: number;
  penaltiesDeduction: number;
  otherDeductions: number;
  totalDeductions: number;

  // Net Pay & Company Costs
  netSalary: number;
  gosiEmployerShare: number;
  totalCompanyBurden: number; // Net + GOSI Employer + all costs
  saudiGosiPaymentMode?: 'SHARED' | 'COMPANY_FULL';
  manualAddition?: number;
  manualDeduction?: number;
  adjustmentNotes?: string;
  priorPeriodGross?: number;
  priorPeriodDeductions?: number;
  priorPeriodNet?: number;
  priorPeriodDetails?: Array<{ periodMonth: string; gross: number; deductions: number; net: number }>;
  entitlementStatus?: PayrollEntitlementStatus;
  entitlementReason?: string;
  entitlementDocumentRef?: string;
  entitlementUpdatedAt?: string;

  // Flags & Warnings
  isSuspended: boolean;
  warningFlags: string[];
}

export type PayrollSettlementStatus = 'PENDING' | 'PAID' | 'REVERSED';
export type PayrollSettlementReason = 'HELD_PAYROLL' | 'RETROACTIVE_EMPLOYEE' | 'PAYROLL_DIFFERENCE';

export interface PayrollSettlement {
  id: string;
  companyId: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  periodMonth: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  reason: PayrollSettlementReason;
  sourcePayrollRunId?: string;
  sourcePayrollItemId?: string;
  dedupeKey: string;
  status: PayrollSettlementStatus;
  paymentMethod?: PaymentMethod;
  paymentDate?: string;
  paymentReference?: string;
  notes?: string;
  createdAt: string;
  paidAt?: string;
  reversedAt?: string;
  reversalReason?: string;
}

export type PaymentBatchStatus = 'SCHEDULED' | 'PAID' | 'FAILED' | 'CANCELLED';
export type PaymentMethod = 'WPS' | 'BANK_TRANSFER' | 'CASH';

export interface PayrollPriorEntitlement {
  sourcePayrollRunId: string;
  sourcePayrollItemId: string;
  sourcePeriodMonth: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  amount: number;
}

export interface PayrollPaymentBatch {
  id: string;
  batchNumber: string;
  payrollRunId: string;
  companyId: string;
  periodMonth: string;
  employeeIds: string[];
  employeesCount: number;
  totalAmount: number;
  method: PaymentMethod;
  status: PaymentBatchStatus;
  scheduledDate: string;
  paymentDate?: string;
  paymentReversalReason?: string;
  paymentReversedAt?: string;
  paymentReversedBy?: string;
  paymentReversedByName?: string;
  reversedPaymentDate?: string;
  reference?: string;
  notes?: string;
  priorEntitlements?: PayrollPriorEntitlement[];
  createdAt: string;
  createdBy?: string;
}

export interface PayrollRun {
  id: string;
  companyId: string;
  periodMonth: string; // e.g. "2026-08"
  startDate: string;
  endDate: string;
  status: PayrollRunStatus;
  createdAt: string;
  calculatedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  postedAt?: string;
  postedBy?: string;
  
  // Aggregated Totals
  employeesCount: number;
  totalBaseSalaries: number;
  totalAllowances: number;
  totalOvertime: number;
  totalGrossSalaries: number;
  totalAbsenceDeductions: number;
  totalDelayDeductions: number;
  totalGosiEmployee: number;
  totalGosiEmployer: number;
  totalLoanDeductions: number;
  totalPenalties: number;
  totalDeductions: number;
  totalNetSalaries: number;
  totalCompanyCost: number;

  items: PayrollRunItem[];
  journalBatchId?: string;
  paymentBatches?: PayrollPaymentBatch[];
}

export interface JournalLine {
  id: string;
  accountCode: string;
  accountNameAr: string;
  accountNameEn?: string;
  descriptionAr: string;
  descriptionEn?: string;
  debit: number;
  credit: number;
  costCenterCode?: string;
  costCenterName?: string;
  costCenterNameEn?: string;
  contactName?: string;
}

export interface JournalBatch {
  id: string;
  companyId: string;
  payrollRunId: string;
  periodMonth: string;
  batchNumber: string;
  date: string;
  description: string;
  descriptionEn?: string;
  totalDebit: number;
  totalCredit: number;
  status: 'DRAFT' | 'EXPORTED_TO_QOYOD' | 'POSTED';
  qoyodSyncStatus?: {
    synced: boolean;
    syncedAt?: string;
    qoyodJournalId?: string;
    errorMessage?: string;
  };
  lines: JournalLine[];
}

export type NavigationTab = 
  | 'dashboard' 
  | 'company_profile'
  | 'employees' 
  | 'payroll_runs' 
  | 'settlements'
  | 'attendance' 
  | 'loans_penalties' 
  | 'journals' 
  | 'reports' 
  | 'users'
  | 'settings' 
  | 'audit_logs';

export interface AuditLog {
  id: string;
  companyId?: string;
  userId?: string;
  userName: string;
  userRole: UserRole;
  action: string;
  entityType?: string;
  entity?: string;
  entityId: string;
  timestamp: string;
  details?: string;
  descriptionAr?: string;
  diff?: {
    before?: any;
    after?: any;
  };
}

export interface QoyodApiConfig {
  apiKey: string;
  apiKeyConfigured?: boolean;
  baseUrl: string;
  organizationId: string;
  autoSyncOnApprove: boolean;
  lastTestStatus?: 'SUCCESS' | 'FAILED';
  lastTestMessage?: string;
}

export interface QoyodAmountItem {
  account_id: number | string;
  amount: number | string;
  comment?: string;
  contact_id?: number | string;
  entry_id?: number;
  all_comments?: string[];
}

export interface QoyodJournalEntryPayload {
  journal_entry: {
    description: string;
    date: string;
    debit_amounts: QoyodAmountItem[];
    credit_amounts: QoyodAmountItem[];
  };
}

export interface QoyodJournalEntryResponse {
  id: number | string;
  date: string;
  description: string;
  total_debit: string | number;
  total_credit: string | number;
  debit_amounts: QoyodAmountItem[];
  credit_amounts: QoyodAmountItem[];
}
