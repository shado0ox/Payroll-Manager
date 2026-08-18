import { 
  Company, 
  Employee, 
  AttendanceRecord, 
  LoanSchedule, 
  PenaltyRecord, 
  LeaveRequest, 
  PayrollRun, 
  JournalBatch, 
  AuditLog, 
  QoyodApiConfig, 
  UserRole,
  UserAccount
} from '../types';
import { 
  INITIAL_COMPANIES, 
  INITIAL_QOYOD_CONFIG 
} from '../data/initialData';

const STORAGE_KEYS = {
  COMPANIES: 'payroll_companies_v1',
  ACTIVE_COMPANY_ID: 'payroll_active_company_id_v1',
  ACTIVE_ROLE: 'payroll_active_role_v1',
  CURRENT_USER: 'payroll_current_user_v1',
  USERS: 'payroll_users_v1',
  EMPLOYEES: 'payroll_employees_v1',
  ATTENDANCE: 'payroll_attendance_v1',
  LOANS: 'payroll_loans_v1',
  PENALTIES: 'payroll_penalties_v1',
  LEAVES: 'payroll_leaves_v1',
  PAYROLL_RUNS: 'payroll_runs_v1',
  JOURNALS: 'payroll_journals_v1',
  AUDIT_LOGS: 'payroll_audit_logs_v1',
  QOYOD_CONFIG: 'payroll_qoyod_config_v1',
};

export const DEFAULT_USERS: UserAccount[] = [];

export interface AppState {
  companies: Company[];
  activeCompanyId: string;
  activeRole: UserRole;
  currentUser: UserAccount | null;
  users: UserAccount[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  loans: LoanSchedule[];
  penalties: PenaltyRecord[];
  leaves: LeaveRequest[];
  payrollRuns: PayrollRun[];
  journals: JournalBatch[];
  auditLogs: AuditLog[];
  qoyodConfig: QoyodApiConfig;
}

export function loadInitialState(): AppState {
  try {
    const rawCompanies = localStorage.getItem(STORAGE_KEYS.COMPANIES);
    if (rawCompanies) {
      const companies: Company[] = JSON.parse(rawCompanies);
      const activeCompanyId = localStorage.getItem(STORAGE_KEYS.ACTIVE_COMPANY_ID) || companies[0]?.id || 'comp-1';
      
      const rawUsers = localStorage.getItem(STORAGE_KEYS.USERS);
      let users: UserAccount[] = rawUsers ? JSON.parse(rawUsers) : DEFAULT_USERS;
      
      // localStorage is never trusted as proof of authentication.
      const currentUser: UserAccount | null = null;

      const activeRole: UserRole = currentUser?.role || (localStorage.getItem(STORAGE_KEYS.ACTIVE_ROLE) as UserRole) || 'ADMIN';
      const rawEmployees: Employee[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.EMPLOYEES) || '[]');
      
      // Deduplicate employees by ID to guarantee unique React keys
      const seenEmpIds = new Set<string>();
      const employees: Employee[] = [];
      rawEmployees.forEach(emp => {
        if (emp && emp.id && !seenEmpIds.has(emp.id)) {
          seenEmpIds.add(emp.id);
          employees.push(emp);
        } else if (emp && emp.id) {
          // If duplicate key encountered in existing stored state, give it a unique suffix
          const uniqueId = `${emp.id}-dup-${Math.random().toString(36).substring(2, 7)}`;
          employees.push({ ...emp, id: uniqueId });
        }
      });
      const attendance: AttendanceRecord[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.ATTENDANCE) || '[]');
      const loans: LoanSchedule[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOANS) || '[]');
      const penalties: PenaltyRecord[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PENALTIES) || '[]');
      const leaves: LeaveRequest[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEAVES) || '[]');
      const payrollRuns: PayrollRun[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PAYROLL_RUNS) || '[]');
      const journals: JournalBatch[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.JOURNALS) || '[]');
      const auditLogs: AuditLog[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS) || '[]');
      const qoyodConfig: QoyodApiConfig = JSON.parse(localStorage.getItem(STORAGE_KEYS.QOYOD_CONFIG) || JSON.stringify(INITIAL_QOYOD_CONFIG));

      return {
        companies,
        activeCompanyId,
        activeRole,
        currentUser,
        users,
        employees,
        attendance,
        loans,
        penalties,
        leaves,
        payrollRuns,
        journals,
        auditLogs,
        qoyodConfig,
      };
    }
  } catch (err) {
    console.error('Failed to parse state from localStorage, initializing fresh data', err);
  }

  // Clean Production Starter dataset
  const companies = INITIAL_COMPANIES;
  const activeCompanyId = companies[0]?.id || 'comp-1';
  const users = DEFAULT_USERS;
  const currentUser: UserAccount | null = null; // Forces real login!
  const activeRole: UserRole = 'ADMIN';

  const employees: Employee[] = [];
  const attendance: AttendanceRecord[] = [];
  const loans: LoanSchedule[] = [];
  const penalties: PenaltyRecord[] = [];
  const leaves: LeaveRequest[] = [];
  const payrollRuns: PayrollRun[] = [];
  const journals: JournalBatch[] = [];

  const auditLogs: AuditLog[] = [
    {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userName: 'النظام',
      userRole: 'ADMIN',
      action: 'تهيئة النظام وبدء بيئة العمل الإنتاجية',
      entityType: 'COMPANY',
      entityId: activeCompanyId,
      details: 'تم بدء النظام بنجاح وجاهز لتسجيل دخول المستخدمين وإدارة الرواتب',
    }
  ];
  const qoyodConfig = INITIAL_QOYOD_CONFIG;

  const initialState: AppState = {
    companies,
    activeCompanyId,
    activeRole,
    currentUser,
    users,
    employees,
    attendance,
    loans,
    penalties,
    leaves,
    payrollRuns,
    journals,
    auditLogs,
    qoyodConfig,
  };

  saveState(initialState);
  return initialState;
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(state.companies));
    localStorage.setItem(STORAGE_KEYS.ACTIVE_COMPANY_ID, state.activeCompanyId);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ROLE, state.activeRole);
    if (state.currentUser) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(state.currentUser));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(state.employees));
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(state.attendance));
    localStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(state.loans));
    localStorage.setItem(STORAGE_KEYS.PENALTIES, JSON.stringify(state.penalties));
    localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(state.leaves));
    localStorage.setItem(STORAGE_KEYS.PAYROLL_RUNS, JSON.stringify(state.payrollRuns));
    localStorage.setItem(STORAGE_KEYS.JOURNALS, JSON.stringify(state.journals));
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(state.auditLogs));
    localStorage.setItem(STORAGE_KEYS.QOYOD_CONFIG, JSON.stringify(state.qoyodConfig));
  } catch (err) {
    console.error('Error saving state to localStorage', err);
  }
}

export function saveCurrentUser(user: UserAccount | null): void {
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
  } catch (e) {}
}

export function saveUsers(users: UserAccount[]): void {
  try { localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users)); } catch (e) {}
}

export function saveCompanies(companies: Company[]): void {
  try { localStorage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(companies)); } catch (e) {}
}

export function saveEmployees(employees: Employee[]): void {
  try {
    const seen = new Set<string>();
    const deduplicated: Employee[] = [];
    employees.forEach((emp, index) => {
      if (!emp) return;
      const safeId = emp.id || `emp-${Date.now()}-${index}`;
      if (!seen.has(safeId)) {
        seen.add(safeId);
        deduplicated.push({ ...emp, id: safeId });
      } else {
        const uniqueId = `${safeId}-dup-${index}-${Math.random().toString(36).substring(2, 6)}`;
        seen.add(uniqueId);
        deduplicated.push({ ...emp, id: uniqueId });
      }
    });
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(deduplicated));
  } catch (e) {}
}

export function savePayrollRuns(runs: PayrollRun[]): void {
  try { localStorage.setItem(STORAGE_KEYS.PAYROLL_RUNS, JSON.stringify(runs)); } catch (e) {}
}

export function saveAttendance(att: AttendanceRecord[]): void {
  try { localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(att)); } catch (e) {}
}

export function saveLeaves(leaves: LeaveRequest[]): void {
  try { localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(leaves)); } catch (e) {}
}

export function saveLoans(loans: LoanSchedule[]): void {
  try { localStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(loans)); } catch (e) {}
}

export function savePenalties(penalties: PenaltyRecord[]): void {
  try { localStorage.setItem(STORAGE_KEYS.PENALTIES, JSON.stringify(penalties)); } catch (e) {}
}

export function saveJournals(journals: JournalBatch[]): void {
  try { localStorage.setItem(STORAGE_KEYS.JOURNALS, JSON.stringify(journals)); } catch (e) {}
}

export function saveAuditLogs(logs: AuditLog[]): void {
  try { localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs)); } catch (e) {}
}

export function saveQoyodConfig(config: QoyodApiConfig): void {
  try { localStorage.setItem(STORAGE_KEYS.QOYOD_CONFIG, JSON.stringify(config)); } catch (e) {}
}

export function saveActiveCompanyId(id: string): void {
  try { localStorage.setItem(STORAGE_KEYS.ACTIVE_COMPANY_ID, id); } catch (e) {}
}

export function saveActiveRole(role: UserRole): void {
  try { localStorage.setItem(STORAGE_KEYS.ACTIVE_ROLE, role); } catch (e) {}
}

export function resetToCleanState(): AppState {
  try {
    localStorage.clear();
  } catch (e) {}
  return loadInitialState();
}
