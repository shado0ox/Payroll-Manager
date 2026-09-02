import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Building2, 
  Users, 
  Banknote, 
  Clock, 
  Receipt, 
  Layers, 
  FileSpreadsheet, 
  Settings, 
  History,
  ShieldAlert,
  UserCheck
} from 'lucide-react';
import { 
  Company, 
  Employee, 
  PayrollRun, 
  PayrollSettlement,
  AttendanceRecord, 
  LeaveRequest, 
  LoanSchedule, 
  PenaltyRecord, 
  TemporaryEarningRecord,
  JournalBatch, 
  AuditLog, 
  UserRole, 
  UserAccount,
  NavigationTab,
  QoyodApiConfig
} from './types';
import { 
  loadInitialState, 
  saveCompanies, 
  saveEmployees, 
  savePayrollRuns, 
  saveAttendance, 
  saveLeaves, 
  saveLoans, 
  savePenalties, 
  saveJournals, 
  saveAuditLogs, 
  saveQoyodConfig, 
  clearSensitiveLocalState,
  saveActiveCompanyId, 
  saveActiveRole,
  saveUsers,
  saveCurrentUser,
  resetToCleanState
} from './utils/storage';
import { Navbar } from './components/Navbar';
import { hasPermission, isDeveloperAccount, TAB_PERMISSION } from './utils/permissions';
import { Sidebar } from './components/Sidebar';
import { LoginView } from './components/LoginView';
import { UserManagementView } from './components/UserManagementView';
import { DashboardView } from './components/DashboardView';
import { EmployeesView } from './components/EmployeesView';
import { PayrollRunsView } from './components/PayrollRunsView';
import { PayrollSettlementsView } from './components/PayrollSettlementsView';
import { AttendanceLeavesView } from './components/AttendanceLeavesView';
import { LoansPenaltiesView } from './components/LoansPenaltiesView';
import { AccountingJournalsView } from './components/AccountingJournalsView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { CompanyProfileView } from './components/CompanyProfileView';
import { AuditLogsView } from './components/AuditLogsView';
import { EmployeeStatementModal } from './components/EmployeeStatementModal';
import { QoyodIntegrationModal } from './components/QoyodIntegrationModal';
import { DatabaseStatusModal } from './components/DatabaseStatusModal';
import { DatabaseStatus, persistFullStateToDatabase } from './utils/databaseService';
import { api } from './utils/api';
import { WifiOff, Database, CheckCircle2, X } from 'lucide-react';
import { synchronizeEmployeeBankDetails } from './utils/security';
import { useLanguage } from './i18n/LanguageContext';

const TAB_SESSION_KEY = 'masar_tab_session_v1';
const LAST_ACTIVITY_KEY = 'masar_last_activity_v1';
const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const TAB_PATHS: Record<NavigationTab, string> = {
  dashboard: '/dashboard',
  company_profile: '/company',
  employees: '/employees',
  payroll_runs: '/payroll',
  settlements: '/settlements',
  attendance: '/attendance',
  loans_penalties: '/loans-penalties',
  journals: '/journals',
  reports: '/reports',
  users: '/users',
  settings: '/settings',
  audit_logs: '/audit-logs',
};
const PATH_TABS = Object.fromEntries(Object.entries(TAB_PATHS).map(([tab, pathname]) => [pathname, tab])) as Record<string, NavigationTab>;
const tabFromLocation = (): NavigationTab => PATH_TABS[window.location.pathname.replace(/\/$/, '') || '/'] || 'dashboard';
type MasarAppState = ReturnType<typeof loadInitialState> & { temporaryEarnings: TemporaryEarningRecord[] };
const payrollInputLockMessage = (language: 'ar' | 'en') => language === 'ar'
  ? 'هذه العملية مرتبطة بمسير رواتب معتمد/مرحل. يجب إرجاع المسير أولاً قبل تعديلها أو حذفها.'
  : 'This entry is linked to an approved/posted payroll run. Reopen the payroll run before editing or deleting it.';

function isClosedPayrollInputLocked(
  payrollRuns: PayrollRun[],
  kind: 'attendance' | 'loan' | 'penalty' | 'earning',
  record: AttendanceRecord | LoanSchedule | PenaltyRecord | TemporaryEarningRecord,
) {
  const closedRuns = payrollRuns.filter(run => run.companyId === record.companyId && ['APPROVED', 'POSTED'].includes(run.status));
  return closedRuns.some(run => {
    const item = run.items.find(candidate => candidate.employeeId === record.employeeId);
    if (!item) return false;
    // Approval does not lock an unpaid employee. Source inputs lock only after that employee
    // is included in an active transfer batch or the payment has been confirmed.
    const employeePaymentLocked = (run.paymentBatches || []).some(batch =>
      ['SCHEDULED', 'PAID'].includes(batch.status) && (batch.employeeIds || []).includes(record.employeeId)
    );
    if (!employeePaymentLocked) return false;
    if (kind === 'attendance') {
      const attendance = record as AttendanceRecord;
      if (run.periodMonth !== attendance.periodMonth) return false;
      return Boolean(
        attendance.absence || attendance.unpaidLeave || attendance.delayMinutes || attendance.overtimeHours ||
        item.absenceDays || item.absenceDeduction || item.unpaidLeaveDays || item.unpaidLeaveDeduction ||
        item.delayMinutes || item.delayDeduction || item.overtimeHours || item.overtimeAmount
      );
    }
    if (kind === 'penalty') {
      const penalty = record as PenaltyRecord;
      return run.periodMonth === penalty.periodMonth && Number(item.penaltiesDeduction || 0) !== 0;
    }
    if (kind === 'earning') {
      const earning = record as TemporaryEarningRecord;
      return run.periodMonth === earning.periodMonth && Number(item.bonuses || 0) !== 0;
    }
    const loan = record as LoanSchedule;
    return run.periodMonth >= loan.startDate && Number(item.loanDeduction || 0) !== 0;
  });
}


export const App: React.FC = () => {
  const { t, language } = useLanguage();
  const tr = (ar: string, en: string) => language === 'ar' ? ar : en;
  // Initialize full application state
  const [state, setState] = useState<MasarAppState>(() => ({ ...loadInitialState(), temporaryEarnings: [] }));

  const [activeTab, setActiveTabState] = useState<NavigationTab>(() => tabFromLocation());
  const navigateToTab = (tab: NavigationTab, options?: { replace?: boolean }) => {
    const pathname = TAB_PATHS[tab];
    if (window.location.pathname !== pathname) {
      window.history[options?.replace ? 'replaceState' : 'pushState']({ masarTab: tab }, '', pathname);
    }
    setActiveTabState(tab);
  };
  const [statementEmployee, setStatementEmployee] = useState<Employee | null>(null);
  const [isQoyodModalOpen, setIsQoyodModalOpen] = useState(false);
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  const [showDbWarningBanner, setShowDbWarningBanner] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [publicConfig, setPublicConfig] = useState({ registrationEnabled:false,trialDays:14,developerContactPhone:'' });
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistenceEpochRef = useRef(0);
  const remoteStateSnapshotRef = useRef<MasarAppState | null>(null);

  useEffect(() => {
    api.publicConfig().then(setPublicConfig).catch(() => undefined);
  }, []);

  // Restore authentication only inside the same open tab. sessionStorage survives refresh
  // but is cleared when the tab/window is closed.
  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      if (sessionStorage.getItem(TAB_SESSION_KEY) !== 'active') {
        if (!cancelled) setAuthReady(true);
        return;
      }
      const lastActivity = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || 0);
      if (!lastActivity || Date.now() - lastActivity >= IDLE_TIMEOUT_MS) {
        sessionStorage.removeItem(TAB_SESSION_KEY);
        sessionStorage.removeItem(LAST_ACTIVITY_KEY);
        api.logout().catch(() => undefined);
        if (!cancelled) setAuthReady(true);
        return;
      }
      try {
        const [{ user }, remote] = await Promise.all([api.session(), api.getState()]);
        if (cancelled) return;
        setState(prev => {
          const base = remote.state ? { ...prev, ...remote.state } : prev;
          const users = [...(base.users || []).filter(item => item.id !== user.id), user];
          const employees = synchronizeEmployeeBankDetails(base.companies || [], base.employees || []);
          return { ...base, employees, currentUser: user, users, activeRole: user.role } as typeof prev;
        });
        sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      } catch {
        sessionStorage.removeItem(TAB_SESSION_KEY);
        sessionStorage.removeItem(LAST_ACTIVITY_KEY);
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    };
    restoreSession();
    return () => { cancelled = true; };
  }, []);

  // Database Connection Status State
  const [dbStatus, setDbStatus] = useState<DatabaseStatus>(() => ({
    isLocalConnected: false,
    isCloudConnected: false,
    isChecking: true,
    cloudEndpoint: '/api/state',
    lastSavedAt: null,
    saveCount: 0,
    engine: 'POSTGRESQL',
    storageSizeKb: 0,
    recordSummary: {
      companies: state.companies.length,
      employees: state.employees.length,
      payrollRuns: state.payrollRuns.length,
      attendance: state.attendance.length,
      loans: state.loans.length,
      penalties: state.penalties.length,
      leaves: state.leaves.length,
      journals: state.journals.length,
      auditLogs: state.auditLogs.length,
      users: state.users.length,
    },
    lastError: null,
  }));

  // Check the real server endpoint; /api/health verifies PostgreSQL with SELECT 1.
  useEffect(() => {
    if (!state.currentUser) return;
    let cancelled = false;
    const checkDatabaseHealth = async (showChecking: boolean = false) => {
      if (showChecking) setDbStatus(prev => ({ ...prev, isChecking: true }));
      try {
        await api.health();
        if (!cancelled) setDbStatus(prev => ({ ...prev, isCloudConnected: true, isChecking: false, lastError: null }));
      } catch (error: any) {
        if (!cancelled) setDbStatus(prev => ({ ...prev, isCloudConnected: false, isChecking: false, lastError: error?.message || tr('تعذر الاتصال بقاعدة البيانات', 'Could not connect to the database') }));
      }
    };
    void checkDatabaseHealth(true);
    const healthInterval = window.setInterval(() => { void checkDatabaseHealth(false); }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(healthInterval);
    };
  }, [state.currentUser?.id]);

  // Persist immediately and serialize writes so rapid actions cannot cancel each other.
  useEffect(() => {
    if (!state.currentUser) return;
    if (remoteStateSnapshotRef.current === state) {
      remoteStateSnapshotRef.current = null;
      return;
    }
    remoteStateSnapshotRef.current = null;
    const snapshot = state;
    const epoch = persistenceEpochRef.current;
    setDbStatus(prev => ({ ...prev, isChecking: true }));
    persistenceQueueRef.current = persistenceQueueRef.current.catch(() => undefined).then(async () => {
      // A destructive server operation may invalidate snapshots that were queued
      // before it. Never let an old snapshot recreate a deleted record.
      if (epoch !== persistenceEpochRef.current) return;
      try {
        await api.saveState(snapshot);
        const status = await persistFullStateToDatabase(snapshot);
        setDbStatus({ ...status, lastError: null });
      } catch (error: any) {
        try {
          await api.health();
          setDbStatus(prev => ({ ...prev, isCloudConnected: true, isChecking: false, lastError: `${tr('تعذر حفظ آخر تعديل:', 'Could not save the latest change:')} ${error?.message || tr('خطأ غير معروف', 'Unknown error')}` }));
        } catch {
          setDbStatus(prev => ({ ...prev, isCloudConnected: false, isChecking: false, lastError: error?.message || tr('تعذر الاتصال بقاعدة البيانات', 'Could not connect to the database') }));
        }
      }
    });
  }, [state]);

  // Apply changes saved by other users instantly, while keeping the active session
  // and relying on the server's company/permission filtering.
  useEffect(() => {
    const currentUser = state.currentUser;
    if (!currentUser) return;
    return api.subscribeStateEvents((event) => {
      if (!event?.version || event.updatedBy === currentUser.id) return;
      persistenceQueueRef.current = persistenceQueueRef.current.catch(() => undefined).then(async () => {
        try {
          const remote = await api.getState();
          if (!remote.state) return;
          setState(prev => {
            const base = { ...prev, ...remote.state } as MasarAppState;
            const companies = base.companies || [];
            const activeCompanyId = companies.some(company => company.id === prev.activeCompanyId)
              ? prev.activeCompanyId
              : base.activeCompanyId || companies[0]?.id || '';
            const next: MasarAppState = {
              ...base,
              currentUser: prev.currentUser,
              activeRole: prev.currentUser?.role || prev.activeRole,
              activeCompanyId,
              employees: synchronizeEmployeeBankDetails(companies, base.employees || []),
            };
            remoteStateSnapshotRef.current = next;
            return next;
          });
        } catch {
          // EventSource reconnects automatically. A later event/session refresh recovers.
        }
      });
    });
  }, [state.currentUser?.id]);

  // Active Company
  const activeCompany = useMemo(() => {
    return state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];
  }, [state.companies, state.activeCompanyId]);

  useEffect(() => {
    const onPopState = () => setActiveTabState(tabFromLocation());
    window.addEventListener('popstate', onPopState);
    if (window.location.pathname === '/' || !PATH_TABS[window.location.pathname.replace(/\/$/, '')]) {
      window.history.replaceState({ masarTab: activeTab }, '', TAB_PATHS[activeTab]);
    }
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (state.currentUser && !hasPermission(state.currentUser, TAB_PERMISSION[activeTab])) {
      const fallback = (Object.keys(TAB_PERMISSION) as NavigationTab[]).find(tab => hasPermission(state.currentUser, TAB_PERMISSION[tab]));
      if (fallback) navigateToTab(fallback, { replace: true });
    }
  }, [activeTab, state.currentUser]);

  // Auth handlers
  const handleLogin = async (companyCode: string, username: string, password: string) => {
    const { user, companyId } = await api.login(companyCode, username, password);
    const remote = await api.getState();
    setState(prev => {
      const base = remote.state ? { ...prev, ...remote.state } : prev;
      const users = [...(base.users || []).filter(u => u.id !== user.id), user];
      const employees = synchronizeEmployeeBankDetails(base.companies || [], base.employees || []);
      const next = { ...base, employees, currentUser: user, users, activeCompanyId: companyId, activeRole: user.role } as typeof prev;
      saveCurrentUser(user);
      saveActiveRole(user.role);
      saveActiveCompanyId(companyId);
      return next;
    });
    sessionStorage.setItem(TAB_SESSION_KEY, 'active');
    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  };

  const handleLogout = () => {
    sessionStorage.removeItem(TAB_SESSION_KEY);
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);
    api.logout().catch(() => undefined);
    clearSensitiveLocalState();
    setState(prev => {
      if (prev.currentUser) {
        const log: AuditLog = {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userName: prev.currentUser.name,
          userRole: prev.currentUser.role,
          action: tr('تسجيل الخروج من النظام', 'Signed out'),
          entityType: 'AUTH',
          entityId: prev.currentUser.id,
          details: `${tr('تم تسجيل الخروج بنجاح للمستخدم', 'User signed out successfully:')} ${prev.currentUser.username}`,
        };
        const updatedLogs = [log, ...prev.auditLogs];
        saveAuditLogs(updatedLogs);
        saveCurrentUser(null);
        return {
          ...prev,
          currentUser: null,
          auditLogs: updatedLogs,
        };
      }
      saveCurrentUser(null);
      return { ...prev, currentUser: null };
    });
  };

  useEffect(() => {
    if (!state.currentUser) return;
    let timeoutId = 0;
    let lastWrite = 0;
    const expire = () => handleLogout();
    const schedule = () => {
      window.clearTimeout(timeoutId);
      const lastActivity = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || Date.now());
      timeoutId = window.setTimeout(expire, Math.max(0, IDLE_TIMEOUT_MS - (Date.now() - lastActivity)));
    };
    const markActive = () => {
      const now = Date.now();
      if (now - lastWrite > 15_000) {
        sessionStorage.setItem(LAST_ACTIVITY_KEY, String(now));
        lastWrite = now;
      }
      schedule();
    };
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, markActive, { passive: true }));
    schedule();
    return () => {
      window.clearTimeout(timeoutId);
      events.forEach(event => window.removeEventListener(event, markActive));
    };
  }, [state.currentUser?.id]);

  // User Management handlers
  const handleSaveUser = async (user: UserAccount) => {
    if (user.id === 'user-admin' || !hasPermission(state.currentUser, 'MANAGE_USERS')) {
      alert(tr('لا يمكن تعديل مدير النظام الأساسي، وإدارة المستخدمين متاحة للإدارة فقط.', 'The primary system administrator cannot be edited. User management is restricted to administrators.'));
      return;
    }
    const savedUser = await api.saveUser(user);
    user = savedUser;
    setState(prev => {
      const exists = prev.users.some(u => u.id === user.id);
      const updated = exists
        ? prev.users.map(u => u.id === user.id ? user : u)
        : [user, ...prev.users];

      saveUsers(updated);

      // If updating current logged in user
      let nextCurrentUser = prev.currentUser;
      if (prev.currentUser?.id === user.id) {
        nextCurrentUser = user;
        saveCurrentUser(user);
      }

      const log: AuditLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userName: prev.currentUser?.name || 'مسؤول النظام',
        userRole: prev.activeRole,
        action: exists ? tr('تعديل بيانات وصلاحيات مستخدم', 'Updated user details and permissions') : tr('إنشاء حساب مستخدم جديد', 'Created user account'),
        entityType: 'USER',
        entityId: user.id,
        details: `${tr('المستخدم:', 'User:')} ${user.name} (${user.username}) - ${tr('الدور:', 'Role:')} ${user.role}`,
      };
      const updatedLogs = [log, ...prev.auditLogs];
      saveAuditLogs(updatedLogs);

      return {
        ...prev,
        users: updated,
        currentUser: nextCurrentUser,
        auditLogs: updatedLogs,
      };
    });
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === 'user-admin' || !hasPermission(state.currentUser, 'MANAGE_USERS')) {
      alert(tr('لا يمكن حذف مدير النظام الأساسي، وإدارة المستخدمين متاحة للإدارة فقط.', 'The primary system administrator cannot be deleted. User management is restricted to administrators.'));
      return;
    }
    await api.deleteUser(userId);
    setState(prev => {
      const targetUser = prev.users.find(u => u.id === userId);
      const updated = prev.users.filter(u => u.id !== userId);
      saveUsers(updated);

      const log: AuditLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userName: prev.currentUser?.name || 'مسؤول النظام',
        userRole: prev.activeRole,
        action: tr('حذف حساب مستخدم', 'Deleted user account'),
        entityType: 'USER',
        entityId: userId,
        details: `${tr('تم حذف حساب المستخدم:', 'Deleted user account:')} ${targetUser?.name || userId}`,
      };
      const updatedLogs = [log, ...prev.auditLogs];
      saveAuditLogs(updatedLogs);

      return {
        ...prev,
        users: updated,
        auditLogs: updatedLogs,
      };
    });
  };

  // Persist handlers
  const handleSelectCompany = (companyId: string) => {
    setState(prev => {
      if (prev.currentUser?.role === 'ADMIN' && !prev.currentUser.companyIds.includes(companyId)) return prev;
      const next = { ...prev, activeCompanyId: companyId };
      saveActiveCompanyId(companyId);
      return next;
    });
  };

  const handleSaveEmployee = async (employee: Employee) => {
    const operation = persistenceQueueRef.current.catch(() => undefined).then(async () => {
      const result = await api.saveEmployee(employee);
      if (!result?.employee || result.employee.id !== employee.id || !result.version) {
        throw new Error('EMPLOYEE_DIRECT_SAVE_FAILED');
      }
      return result;
    });

    persistenceQueueRef.current = operation.then(() => undefined, () => undefined);

    try {
      const result = await operation;
      setState(prev => {
        const exists = (prev.employees || []).some(candidate => candidate.id === result.employee.id);
        const employees = exists
          ? (prev.employees || []).map(candidate => candidate.id === result.employee.id ? result.employee as Employee : candidate)
          : [result.employee as Employee, ...(prev.employees || [])];
        const next: MasarAppState = {
          ...prev,
          employees: synchronizeEmployeeBankDetails(prev.companies || [], employees),
        };
        remoteStateSnapshotRef.current = next;
        return next;
      });
      setDbStatus(prev => ({ ...prev, isCloudConnected: true, isChecking: false, lastError: null, lastSavedAt: result.updated_at || new Date().toISOString() }));
    } catch (error: any) {
      setDbStatus(prev => ({ ...prev, isChecking: false, lastError: `${tr('تعذر حفظ الموظف:', 'Could not save employee:')} ${error?.message || 'UNKNOWN_ERROR'}` }));
      throw error;
    }
  };

  const handleBulkImportEmployees = (importedEmployees: Employee[]) => {
    if (!importedEmployees.length) return;
    setState(prev => {
      const importedIds = new Set(importedEmployees.map(employee => employee.id));
      const updated = [...importedEmployees, ...prev.employees.filter(employee => !importedIds.has(employee.id))];
      saveEmployees(updated);
      const log: AuditLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userName: prev.currentUser?.name || 'المدير العام',
        userRole: prev.activeRole,
        action: tr('استيراد موظفين من ملف', 'Imported employees from file'),
        entityType: 'EMPLOYEE',
        entityId: importedEmployees[0].companyId,
        details: `${tr('تم استيراد', 'Imported')} ${importedEmployees.length} ${tr('موظف من', 'employees from')} Excel/CSV`,
      };
      const updatedLogs = [log, ...prev.auditLogs];
      saveAuditLogs(updatedLogs);
      return { ...prev, employees: updated, auditLogs: updatedLogs };
    });
  };

  const handleDeleteAllCompanyEmployees = (companyId: string) => {
    setStatementEmployee(null);
    setState(prev => {
      const deletedEmployees = prev.employees.filter(employee => employee.companyId === companyId);
      const employeeIds = new Set(deletedEmployees.map(employee => employee.id));
      if (!employeeIds.size) return prev;

      const employees = prev.employees.filter(employee => !employeeIds.has(employee.id));
      const attendance = prev.attendance.filter(record => !employeeIds.has(record.employeeId));
      const leaves = prev.leaves.filter(record => !employeeIds.has(record.employeeId));
      const loans = prev.loans.filter(record => !employeeIds.has(record.employeeId));
      const penalties = prev.penalties.filter(record => !employeeIds.has(record.employeeId));
      const temporaryEarnings = prev.temporaryEarnings.filter(record => !employeeIds.has(record.employeeId));
      const payrollRuns = prev.payrollRuns.filter(run => run.companyId !== companyId);
      const journals = prev.journals.filter(journal => journal.companyId !== companyId);
      const users = prev.users.map(user => employeeIds.has(user.employeeId || '') ? { ...user, employeeId: undefined } : user);

      saveEmployees(employees);
      saveAttendance(attendance);
      saveLeaves(leaves);
      saveLoans(loans);
      savePenalties(penalties);
      savePayrollRuns(payrollRuns);
      saveJournals(journals);
      saveUsers(users);

      const log: AuditLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userName: prev.currentUser?.name || 'مسؤول النظام',
        userRole: prev.activeRole,
        action: tr('مسح جميع موظفي المنشأة', 'Deleted all company employees'),
        entityType: 'COMPANY',
        entityId: companyId,
        details: `${tr('تم حذف', 'Deleted')} ${deletedEmployees.length} ${tr('موظفًا وجميع بياناتهم المرتبطة', 'employees and all related records')}`,
      };
      const auditLogs = [log, ...prev.auditLogs];
      saveAuditLogs(auditLogs);

      return { ...prev, employees, attendance, leaves, loans, penalties, temporaryEarnings, payrollRuns, journals, users, auditLogs };
    });
  };

  const handleSavePayrollRunConfirmed = async (run: PayrollRun): Promise<boolean> => {
    const operation = persistenceQueueRef.current.catch(() => undefined).then(() => api.savePayrollRun(run));
    persistenceQueueRef.current = operation.then(() => undefined, () => undefined);
    try {
      setDbStatus(prev => ({ ...prev, isChecking: true }));
      const result = await operation;
      setState(prev => {
        const payrollRuns = prev.payrollRuns.some(candidate => candidate.id === result.record.id)
          ? prev.payrollRuns.map(candidate => candidate.id === result.record.id ? result.record as PayrollRun : candidate)
          : [result.record as PayrollRun, ...prev.payrollRuns];
        const next = { ...prev, payrollRuns };
        remoteStateSnapshotRef.current = next;
        return next;
      });
      setDbStatus(prev => ({
        ...prev,
        isCloudConnected: true,
        isChecking: false,
        lastSavedAt: result.updated_at,
        lastError: null,
      }));
      return true;
    } catch (error: any) {
      setDbStatus(prev => ({ ...prev,isChecking:false,lastError:error?.message || tr('تعذر حفظ عملية الرواتب', 'Could not save the payroll action') }));
      alert(tr('تعذر حفظ تعديل المسير. لم يتم اعتماد أي تغيير غير مؤكد.', 'The payroll change could not be saved. No unconfirmed change was applied.'));
      return false;
    }
  };

  const handleSavePayrollRun = async (run: PayrollRun) => { await handleSavePayrollRunConfirmed(run); };

  const handleSavePayrollSettlement = async (settlement: PayrollSettlement) => {
    let duplicate = false;
    setState(prev => {
      duplicate = prev.payrollSettlements.some(item => item.companyId === settlement.companyId && item.dedupeKey === settlement.dedupeKey && item.status !== 'REVERSED' && item.id !== settlement.id);
      if (duplicate) return prev;
      const payrollSettlements = prev.payrollSettlements.some(item => item.id === settlement.id)
        ? prev.payrollSettlements.map(item => item.id === settlement.id ? settlement : item)
        : [settlement, ...prev.payrollSettlements];
      return { ...prev, payrollSettlements };
    });
    if (duplicate) throw new Error('DUPLICATE_PAYROLL_SETTLEMENT');
  };

  const handleAddAttendance = async (record: AttendanceRecord) => {
    if (isClosedPayrollInputLocked(state.payrollRuns, 'attendance', record)) {
      alert(payrollInputLockMessage(language));
      return;
    }
    const operation = persistenceQueueRef.current.catch(() => undefined).then(() => api.saveAttendanceRecord(record));
    persistenceQueueRef.current = operation.then(() => undefined, () => undefined);
    try {
      const result = await operation;
      setState(prev => {
        const attendance = prev.attendance.some(item => item.id === result.record.id)
          ? prev.attendance.map(item => item.id === result.record.id ? result.record : item)
          : [result.record, ...prev.attendance];
        const next = { ...prev, attendance };
        remoteStateSnapshotRef.current = next;
        return next;
      });
      setDbStatus(prev => ({ ...prev, isCloudConnected:true, isChecking:false, lastError:null, lastSavedAt:result.updated_at }));
    } catch (error:any) {
      setDbStatus(prev => ({ ...prev, isChecking:false, lastError:`${tr('تعذر حفظ حركة الحضور:', 'Could not save attendance record:')} ${error?.message || 'UNKNOWN_ERROR'}` }));
      throw error;
    }
  };

  const handleBulkImportAttendance = (records: AttendanceRecord[]) => {
    if (records.some(record => isClosedPayrollInputLocked(state.payrollRuns, 'attendance', record))) {
      alert(payrollInputLockMessage(language));
      return;
    }
    setState(prev => {
      const updated = [...records, ...prev.attendance];
      saveAttendance(updated);
      return { ...prev, attendance: updated };
    });
  };

  const handleDeleteAttendance = async (recordId: string) => {
    const existingRecord = state.attendance.find(item => item.id === recordId);
    if (existingRecord && isClosedPayrollInputLocked(state.payrollRuns, 'attendance', existingRecord)) {
      alert(payrollInputLockMessage(language));
      return;
    }
    const operation = persistenceQueueRef.current.catch(() => undefined).then(() => api.deleteAttendanceRecord(recordId));
    persistenceQueueRef.current = operation.then(() => undefined, () => undefined);
    try {
      const result = await operation;
      setState(prev => {
        const next = { ...prev, attendance:prev.attendance.filter(item => item.id !== recordId) };
        remoteStateSnapshotRef.current = next;
        return next;
      });
      setDbStatus(prev => ({ ...prev, isCloudConnected:true, isChecking:false, lastError:null, lastSavedAt:result.updated_at }));
    } catch (error:any) {
      setDbStatus(prev => ({ ...prev, isChecking:false, lastError:`${tr('تعذر حذف حركة الحضور:', 'Could not delete attendance record:')} ${error?.message || 'UNKNOWN_ERROR'}` }));
      throw error;
    }
  };

  const handleUpdateLeaveStatus = (leaveId: string, status: 'PENDING' | 'APPROVED' | 'REJECTED') => {
    setState(prev => {
      const updated = prev.leaves.map(l => l.id === leaveId ? { ...l, status } : l);
      saveLeaves(updated);
      return { ...prev, leaves: updated };
    });
  };

  const handleAddLeave = (leave: LeaveRequest) => {
    setState(prev => {
      const updated = prev.leaves.some(item => item.id === leave.id)
        ? prev.leaves.map(item => item.id === leave.id ? leave : item)
        : [leave, ...prev.leaves];
      saveLeaves(updated);
      return { ...prev, leaves: updated };
    });
  };

  const commitLoanRecord = async (loan: LoanSchedule) => {
    const operation = persistenceQueueRef.current.catch(() => undefined).then(() => api.saveLoanRecord(loan));
    persistenceQueueRef.current = operation.then(() => undefined, () => undefined);
    try {
      const result = await operation;
      setState(prev => {
        const loans = prev.loans.some(item => item.id === result.record.id)
          ? prev.loans.map(item => item.id === result.record.id ? result.record : item)
          : [result.record, ...prev.loans];
        const next = { ...prev, loans };
        remoteStateSnapshotRef.current = next;
        return next;
      });
      setDbStatus(prev => ({ ...prev, isCloudConnected:true, isChecking:false, lastError:null, lastSavedAt:result.updated_at }));
      return result.record;
    } catch (error:any) {
      setDbStatus(prev => ({ ...prev, isChecking:false, lastError:`${tr('تعذر حفظ السلفة:', 'Could not save loan:')} ${error?.message || 'UNKNOWN_ERROR'}` }));
      throw error;
    }
  };

  const handleAddLoan = async (loan: LoanSchedule) => {
    const existingLoan = state.loans.find(item => item.id === loan.id);
    if (existingLoan && isClosedPayrollInputLocked(state.payrollRuns, 'loan', existingLoan)) {
      alert(payrollInputLockMessage(language));
      return;
    }
    await commitLoanRecord(loan);
  };

  const handleUpdateLoanStatus = async (loanId: string, status: LoanSchedule['status']) => {
    const existingLoan = state.loans.find(item => item.id === loanId);
    if (existingLoan && isClosedPayrollInputLocked(state.payrollRuns, 'loan', existingLoan)) {
      alert(payrollInputLockMessage(language));
      return;
    }
    if (!existingLoan) return;
    await commitLoanRecord({ ...existingLoan, status });
  };

  const handleDeleteLoan = async (loanId: string) => {
    const existingLoan = state.loans.find(item => item.id === loanId);
    if (existingLoan && isClosedPayrollInputLocked(state.payrollRuns, 'loan', existingLoan)) {
      alert(payrollInputLockMessage(language));
      return;
    }
    const operation = persistenceQueueRef.current.catch(() => undefined).then(() => api.deleteLoanRecord(loanId));
    persistenceQueueRef.current = operation.then(() => undefined, () => undefined);
    try {
      const result = await operation;
      setState(prev => {
        const next = { ...prev, loans:prev.loans.filter(item => item.id !== loanId) };
        remoteStateSnapshotRef.current = next;
        return next;
      });
      setDbStatus(prev => ({ ...prev, isCloudConnected:true, isChecking:false, lastError:null, lastSavedAt:result.updated_at }));
    } catch (error:any) {
      setDbStatus(prev => ({ ...prev, isChecking:false, lastError:`${tr('تعذر حذف السلفة:', 'Could not delete loan:')} ${error?.message || 'UNKNOWN_ERROR'}` }));
      throw error;
    }
  };

  const handleAdjustLoan = async (loanId: string, amount: number, reason: string, date: string) => {
    const adjustmentDate = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(amount) || amount === 0 || !reason.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || Number.isNaN(adjustmentDate.getTime()) || adjustmentDate.toISOString().slice(0, 10) !== date) return;
    const existing = state.loans.find(item => item.id === loanId);
    if (!existing) return;
    const nextBalance = Number((existing.remainingAmount + amount).toFixed(2));
    if (nextBalance < 0) {
      alert(tr('لا يمكن أن تجعل التسوية رصيد السلفة أقل من صفر.', 'The adjustment cannot make the loan balance negative.'));
      return;
    }
    const adjustment = { id:`loan-adj-${Date.now()}`,amount,date,reason:reason.trim(),createdAt:new Date().toISOString(),createdBy:state.currentUser?.id };
    const installment = Number(existing.monthlyInstallment || 0);
    const remainingInstallments = nextBalance === 0 ? 0 : installment > 0 ? Math.ceil(nextBalance / installment) : existing.remainingInstallments;
    const status = nextBalance === 0 ? 'COMPLETED' as const : existing.status === 'COMPLETED' ? 'ACTIVE' as const : existing.status;
    await commitLoanRecord({ ...existing,remainingAmount:nextBalance,remainingInstallments,status,adjustments:[...(existing.adjustments || []),adjustment] });
  };

  const handleAddPenalty = async (penalty: PenaltyRecord) => {
    const existingPenalty = state.penalties.find(item => item.id === penalty.id);
    if (existingPenalty && isClosedPayrollInputLocked(state.payrollRuns, 'penalty', existingPenalty)) {
      alert(payrollInputLockMessage(language));
      return;
    }
    const operation = persistenceQueueRef.current.catch(() => undefined).then(() => api.savePenaltyRecord(penalty));
    persistenceQueueRef.current = operation.then(() => undefined, () => undefined);
    try {
      const result = await operation;
      setState(prev => {
        const penalties = prev.penalties.some(item => item.id === result.record.id)
          ? prev.penalties.map(item => item.id === result.record.id ? result.record : item)
          : [result.record, ...prev.penalties];
        const next = { ...prev, penalties };
        remoteStateSnapshotRef.current = next;
        return next;
      });
      setDbStatus(prev => ({ ...prev, isCloudConnected:true, isChecking:false, lastError:null, lastSavedAt:result.updated_at }));
    } catch (error:any) {
      setDbStatus(prev => ({ ...prev, isChecking:false, lastError:`${tr('تعذر حفظ الجزاء:', 'Could not save penalty:')} ${error?.message || 'UNKNOWN_ERROR'}` }));
      throw error;
    }
  };

  const handleCancelPenalty = async (penaltyId: string) => {
    const existingPenalty = state.penalties.find(item => item.id === penaltyId);
    if (existingPenalty && isClosedPayrollInputLocked(state.payrollRuns, 'penalty', existingPenalty)) {
      alert(payrollInputLockMessage(language));
      return;
    }
    if (!existingPenalty) return;
    await handleAddPenalty({ ...existingPenalty, appliedInPayroll:false });
  };

  const handleDeletePenalty = async (penaltyId: string) => {
    const existingPenalty = state.penalties.find(item => item.id === penaltyId);
    if (existingPenalty && isClosedPayrollInputLocked(state.payrollRuns, 'penalty', existingPenalty)) {
      alert(payrollInputLockMessage(language));
      return;
    }
    const operation = persistenceQueueRef.current.catch(() => undefined).then(() => api.deletePenaltyRecord(penaltyId));
    persistenceQueueRef.current = operation.then(() => undefined, () => undefined);
    try {
      const result = await operation;
      setState(prev => {
        const next = { ...prev, penalties:prev.penalties.filter(item => item.id !== penaltyId) };
        remoteStateSnapshotRef.current = next;
        return next;
      });
      setDbStatus(prev => ({ ...prev, isCloudConnected:true, isChecking:false, lastError:null, lastSavedAt:result.updated_at }));
    } catch (error:any) {
      setDbStatus(prev => ({ ...prev, isChecking:false, lastError:`${tr('تعذر حذف الجزاء:', 'Could not delete penalty:')} ${error?.message || 'UNKNOWN_ERROR'}` }));
      throw error;
    }
  };

  const commitTemporaryEarningRecord = async (earning: TemporaryEarningRecord) => {
    const operation = persistenceQueueRef.current.catch(() => undefined).then(() => api.saveTemporaryEarningRecord(earning));
    persistenceQueueRef.current = operation.then(() => undefined, () => undefined);
    try {
      const result = await operation;
      setState(prev => {
        const temporaryEarnings = prev.temporaryEarnings.some(item => item.id === result.record.id)
          ? prev.temporaryEarnings.map(item => item.id === result.record.id ? result.record : item)
          : [result.record, ...prev.temporaryEarnings];
        const next = { ...prev, temporaryEarnings };
        remoteStateSnapshotRef.current = next;
        return next;
      });
      setDbStatus(prev => ({ ...prev, isCloudConnected:true, isChecking:false, lastError:null, lastSavedAt:result.updated_at }));
      return result.record;
    } catch (error:any) {
      setDbStatus(prev => ({ ...prev, isChecking:false, lastError:`${tr('تعذر حفظ العمولة أو المكافأة:', 'Could not save temporary earning:')} ${error?.message || 'UNKNOWN_ERROR'}` }));
      throw error;
    }
  };

  const handleSaveTemporaryEarning = async (earning: TemporaryEarningRecord) => {
    const existingEarning = state.temporaryEarnings.find(item => item.id === earning.id);
    if (existingEarning && isClosedPayrollInputLocked(state.payrollRuns, 'earning', existingEarning)) {
      alert(payrollInputLockMessage(language));
      return;
    }
    await commitTemporaryEarningRecord(earning);
  };

  const handleCancelTemporaryEarning = async (earningId: string) => {
    const existingEarning = state.temporaryEarnings.find(item => item.id === earningId);
    if (existingEarning && isClosedPayrollInputLocked(state.payrollRuns, 'earning', existingEarning)) {
      alert(payrollInputLockMessage(language));
      return;
    }
    if (!existingEarning) return;
    await commitTemporaryEarningRecord({ ...existingEarning, appliedInPayroll:false });
  };

  const handleDeleteTemporaryEarning = async (earningId: string) => {
    const existingEarning = state.temporaryEarnings.find(item => item.id === earningId);
    if (existingEarning && isClosedPayrollInputLocked(state.payrollRuns, 'earning', existingEarning)) {
      alert(payrollInputLockMessage(language));
      return;
    }
    const operation = persistenceQueueRef.current.catch(() => undefined).then(() => api.deleteTemporaryEarningRecord(earningId));
    persistenceQueueRef.current = operation.then(() => undefined, () => undefined);
    try {
      const result = await operation;
      setState(prev => {
        const next = { ...prev, temporaryEarnings:prev.temporaryEarnings.filter(item => item.id !== earningId) };
        remoteStateSnapshotRef.current = next;
        return next;
      });
      setDbStatus(prev => ({ ...prev, isCloudConnected:true, isChecking:false, lastError:null, lastSavedAt:result.updated_at }));
    } catch (error:any) {
      setDbStatus(prev => ({ ...prev, isChecking:false, lastError:`${tr('تعذر حذف العمولة أو المكافأة:', 'Could not delete temporary earning:')} ${error?.message || 'UNKNOWN_ERROR'}` }));
      throw error;
    }
  };

  const handleDeleteEmployee = async (empId: string) => {
    // Invalidate every state snapshot that was queued before this deletion, then
    // serialize the DELETE after any write that is already in flight.
    persistenceEpochRef.current += 1;
    const deletion = persistenceQueueRef.current.catch(() => undefined).then(async () => {
      const result = await api.deleteEmployee(empId);
      const remote = await api.getState();
      if (!remote.state) throw new Error('STATE_RELOAD_FAILED');
      if ((remote.state.employees || []).some(employee => employee.id === empId)) throw new Error('EMPLOYEE_DELETE_NOT_CONFIRMED');
      return { result, remote };
    });
    persistenceQueueRef.current = deletion.then(() => undefined);
    try {
      const { result, remote } = await deletion;
      setState(prev => {
        const base = { ...prev,...remote.state } as MasarAppState;
        const next:MasarAppState = {
          ...base,
          currentUser:prev.currentUser,
          activeRole:prev.currentUser?.role || prev.activeRole,
          activeCompanyId:prev.activeCompanyId,
          employees:synchronizeEmployeeBankDetails(base.companies || [],base.employees || []),
        };
        remoteStateSnapshotRef.current = next;
        return next;
      });
      alert(result.archived
        ? tr('تمت أرشفة الموظف وإخفاؤه لأن لديه حركات أو مسيرات سابقة.', 'The employee was archived and hidden because historical records exist.')
        : tr('تم حذف الموظف نهائيًا.', 'The employee was permanently deleted.'));
    } catch (error) {
      const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      const message = code === 'FORBIDDEN'
        ? tr('ليس لدى هذا الحساب صلاحية حذف الموظف.', 'This account does not have permission to delete employees.')
        : code === 'EMPLOYEE_NOT_FOUND'
          ? tr('الموظف غير موجود أو تم حذفه بالفعل. حدّث الصفحة.', 'The employee was not found or was already deleted. Refresh the page.')
          : `${tr('تعذر حذف الموظف:', 'Could not delete the employee:')} ${code}`;
      alert(message);
      return;
    }
  };

  const handleAddCompany = (company: Company) => {
    if (!hasPermission(state.currentUser, 'MANAGE_COMPANIES')) return;
    setState(prev => {
      const updated = [...prev.companies, company];
      saveCompanies(updated);

      const log: AuditLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userName: prev.currentUser?.name || 'مسؤول النظام',
        userRole: prev.activeRole,
        action: tr('إضافة منشأة / شركة جديدة', 'Added company'),
        entityType: 'COMPANY',
        entityId: company.id,
        details: `${tr('تمت إضافة الشركة:', 'Added company:')} ${language === 'ar' ? company.nameAr : company.nameEn || company.nameAr} (${tr('كود:', 'Code:')} ${company.companyCode})`,
      };
      const updatedLogs = [log, ...prev.auditLogs];
      saveAuditLogs(updatedLogs);

      return { ...prev, companies: updated, auditLogs: updatedLogs };
    });
  };

  const handleUpdateCompany = (company: Company) => {
    if (!hasPermission(state.currentUser, 'MANAGE_COMPANY_PROFILE')) return;
    setState(prev => {
      const updated = prev.companies.map(c => c.id === company.id ? company : c);
      const synchronizedEmployees = synchronizeEmployeeBankDetails(updated, prev.employees);
      saveCompanies(updated);

      const log: AuditLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userName: prev.currentUser?.name || 'مسؤول النظام',
        userRole: prev.activeRole,
        action: tr('تعديل بيانات المنشأة', 'Updated company details'),
        entityType: 'COMPANY',
        entityId: company.id,
        details: `${tr('تم تعديل بيانات الشركة:', 'Updated company:')} ${language === 'ar' ? company.nameAr : company.nameEn || company.nameAr} (${tr('كود:', 'Code:')} ${company.companyCode})`,
      };
      const updatedLogs = [log, ...prev.auditLogs];
      saveAuditLogs(updatedLogs);

      return { ...prev, companies: updated, employees: synchronizedEmployees, auditLogs: updatedLogs };
    });
  };

  const handleDeleteCompany = (companyId: string) => {
    if (!hasPermission(state.currentUser, 'MANAGE_COMPANIES')) return;
    setState(prev => {
      if (prev.companies.length <= 1) {
        alert(tr('لا يمكن حذف الشركة الوحيدة المتبقية في النظام.', 'The only remaining company cannot be deleted.'));
        return prev;
      }
      const targetComp = prev.companies.find(c => c.id === companyId);
      const updatedCompanies = prev.companies.filter(c => c.id !== companyId);
      const nextActiveId = prev.activeCompanyId === companyId ? updatedCompanies[0].id : prev.activeCompanyId;
      
      saveCompanies(updatedCompanies);
      saveActiveCompanyId(nextActiveId);

      const log: AuditLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userName: prev.currentUser?.name || 'مسؤول النظام',
        userRole: prev.activeRole,
        action: tr('حذف منشأة / شركة', 'Deleted company'),
        entityType: 'COMPANY',
        entityId: companyId,
        details: `${tr('تم حذف الشركة:', 'Deleted company:')} ${targetComp ? (language === 'ar' ? targetComp.nameAr : targetComp.nameEn || targetComp.nameAr) : companyId}`,
      };
      const updatedLogs = [log, ...prev.auditLogs];
      saveAuditLogs(updatedLogs);

      return {
        ...prev,
        companies: updatedCompanies,
        activeCompanyId: nextActiveId,
        auditLogs: updatedLogs,
      };
    });
  };

  const handleSaveQoyodConfig = (config: QoyodApiConfig) => {
    setState(prev => {
      saveQoyodConfig(config);
      return { ...prev, qoyodConfig: config };
    });
  };

  const handleResetData = () => {
    const fresh: MasarAppState = { ...resetToCleanState(), temporaryEarnings: [] };
    setState(fresh);
  };

  const latestCompanyRun = useMemo(() => {
    return state.payrollRuns.find(r => r.companyId === activeCompany?.id);
  }, [state.payrollRuns, activeCompany]);

  const handleRestoreState = (restoredState: typeof state) => {
    setState(restoredState);
  };

  // If not logged in, show real Login View
  if (!authReady) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white text-sm font-bold">{t('checkingSession')}</div>;
  }

  if (!state.currentUser) {
    return <LoginView defaultCompanyCode={state.companies[0]?.companyCode || '101'} onLogin={handleLogin} />;
  }

  const canViewDatabaseTools = isDeveloperAccount(state.currentUser);
  const subscriptionExpired = state.currentUser.role !== 'ADMIN' && activeCompany && (
    activeCompany.subscriptionStatus === 'EXPIRED'
    || activeCompany.subscriptionStatus === 'SUSPENDED'
    || (activeCompany.subscriptionStatus === 'TRIAL' && activeCompany.trialEndsAt && new Date(activeCompany.trialEndsAt).getTime() <= Date.now())
    || (activeCompany.subscriptionStatus === 'ACTIVE' && activeCompany.subscriptionEndsAt && new Date(activeCompany.subscriptionEndsAt).getTime() <= Date.now())
  );
  const trialDaysRemaining = activeCompany?.subscriptionStatus === 'TRIAL' && activeCompany.trialEndsAt
    ? Math.max(0,Math.ceil((new Date(activeCompany.trialEndsAt).getTime()-Date.now())/86_400_000))
    : null;

  if (subscriptionExpired) {
    const phone = publicConfig.developerContactPhone;
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <section className="w-full max-w-lg rounded-[2rem] border border-amber-400/20 bg-slate-900 p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-300"><ShieldAlert className="h-8 w-8" /></div>
        <h1 className="mt-6 text-2xl font-black">{tr('انتهت الفترة التجريبية', 'Trial period ended')}</h1>
        <p className="mt-3 text-sm leading-7 text-slate-400">{tr('تم إيقاف خدمات الشركة مؤقتًا مع الاحتفاظ بجميع بياناتك بأمان. تواصل مع المطور لتجديد الاشتراك وإعادة فتح الخدمات.', 'Company services are temporarily locked while all data remains safely stored. Contact the developer to renew and restore access.')}</p>
        {phone && <a href={`tel:${phone}`} dir="ltr" className="mt-6 block rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-5 py-4 font-mono text-lg font-black text-emerald-300">{phone}</a>}
        <button type="button" onClick={handleLogout} className="mt-6 h-11 w-full rounded-xl bg-white/10 text-sm font-bold text-slate-200 hover:bg-white/15">{tr('تسجيل الخروج', 'Sign out')}</button>
      </section>
    </main>;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f8fafc] font-sans antialiased text-slate-900 selection:bg-emerald-500 selection:text-white">
      
      {/* Dark Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={navigateToTab}
        employeesCount={state.employees.filter(e => e.companyId === activeCompany?.id).length}
        activeRole={state.activeRole}
        currentUser={state.currentUser}
        company={activeCompany}
        onLogout={handleLogout}
      />

      {/* Main Column */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#f8fafc]">
        
        {/* Top Header Navbar */}
        <Navbar
          companies={state.currentUser.role === 'ADMIN' ? state.companies.filter(company => state.currentUser!.companyIds.includes(company.id)) : state.companies}
          activeCompany={activeCompany}
          currentUser={state.currentUser}
          dbStatus={dbStatus}
          onOpenDbModal={canViewDatabaseTools ? () => setIsDbModalOpen(true) : undefined}
          onSelectCompany={handleSelectCompany}
          onLogout={handleLogout}
          onOpenQoyodModal={() => setIsQoyodModalOpen(true)}
          onNavigate={navigateToTab}
          onResetData={handleResetData}
        />

        {trialDaysRemaining !== null && <div className="flex shrink-0 items-center justify-center gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-900">
          <Clock className="h-4 w-4" />
          {tr(`الفترة التجريبية: متبقي ${trialDaysRemaining} يوم`, `Free trial: ${trialDaysRemaining} days remaining`)}
          {publicConfig.developerContactPhone && <span className="text-emerald-700">— {tr('للاشتراك:', 'Subscribe:')} <span dir="ltr">{publicConfig.developerContactPhone}</span></span>}
        </div>}

        {/* Database Status Notification Banner (Shows when cloud DB is disconnected) */}
        {canViewDatabaseTools && !dbStatus.isChecking && !dbStatus.isCloudConnected && showDbWarningBanner && (
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-amber-200/80 px-6 py-2 flex items-center justify-between gap-3 text-xs text-amber-900 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse"></span>
              <span className="font-bold shrink-0">{t('databaseNotice')}</span>
              <span className="text-slate-700 truncate font-medium">
                {t('databaseUnavailable')}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsDbModalOpen(true)}
                className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
              >
                {t('checkConnectionBackup')}
              </button>
              <button
                onClick={() => setShowDbWarningBanner(false)}
                title={t('hideNotice')}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Workspace Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="max-w-7xl mx-auto w-full">
            {activeTab === 'dashboard' && hasPermission(state.currentUser, 'VIEW_DASHBOARD') && (
              <DashboardView
                company={activeCompany}
                employees={state.employees}
                payrollRuns={state.payrollRuns}
                loans={state.loans}
                activeRole={state.activeRole}
                onNavigate={navigateToTab}
                onViewEmployeeStatement={setStatementEmployee}
              />
            )}

            {activeTab === 'company_profile' && hasPermission(state.currentUser, 'MANAGE_COMPANY_PROFILE') && (
              <CompanyProfileView
                company={activeCompany}
                allCompanies={state.currentUser.role === 'ADMIN' ? state.companies.filter(company => state.currentUser!.companyIds.includes(company.id)) : state.companies}
                employees={state.employees}
                users={state.users}
                activeRole={state.activeRole}
                currentUser={state.currentUser}
                qoyodConfig={state.qoyodConfig}
                onSaveQoyodConfig={handleSaveQoyodConfig}
                onOpenQoyodModal={() => setIsQoyodModalOpen(true)}
                onUpdateCompany={handleUpdateCompany}
                onSelectCompany={handleSelectCompany}
                onSaveUser={handleSaveUser}
                onDeleteUser={handleDeleteUser}
                onDeleteAllCompanyEmployees={handleDeleteAllCompanyEmployees}
              />
            )}

            {activeTab === 'employees' && hasPermission(state.currentUser, 'MANAGE_EMPLOYEES') && (
              <EmployeesView
                company={activeCompany}
                employees={state.employees}
                loans={state.loans}
                activeRole={state.activeRole}
                onSaveEmployee={handleSaveEmployee}
                onDeleteEmployee={handleDeleteEmployee}
                onBulkImportEmployees={handleBulkImportEmployees}
                onViewStatement={setStatementEmployee}
              />
            )}

            {activeTab === 'payroll_runs' && hasPermission(state.currentUser, 'MANAGE_PAYROLL') && (
              <PayrollRunsView
                company={activeCompany}
                employees={state.employees}
                payrollRuns={state.payrollRuns}
                attendance={state.attendance}
                loans={state.loans}
                penalties={state.penalties}
                temporaryEarnings={state.temporaryEarnings}
                activeRole={state.activeRole}
                permissions={state.currentUser?.permissions}
                onSavePayrollRun={handleSavePayrollRunConfirmed}
                onViewEmployeeStatement={setStatementEmployee}
                onOpenQoyodModal={() => setIsQoyodModalOpen(true)}
              />
            )}

            {activeTab === 'attendance' && hasPermission(state.currentUser, 'MANAGE_ATTENDANCE') && (
              <AttendanceLeavesView
                company={activeCompany}
                employees={state.employees}
                attendance={state.attendance}
                leaves={state.leaves}
                activeRole={state.activeRole}
                onAddAttendance={handleAddAttendance}
                onBulkImportAttendance={handleBulkImportAttendance}
                onDeleteAttendance={handleDeleteAttendance}
                onUpdateLeaveStatus={handleUpdateLeaveStatus}
                onAddLeave={handleAddLeave}
              />
            )}

            {activeTab === 'loans_penalties' && hasPermission(state.currentUser, 'MANAGE_LOANS_PENALTIES') && (
              <LoansPenaltiesView
                company={activeCompany}
                employees={state.employees}
                loans={state.loans}
                penalties={state.penalties}
                temporaryEarnings={state.temporaryEarnings}
                payrollRuns={state.payrollRuns}
                activeRole={state.activeRole}
                onSaveLoan={handleAddLoan}
                onUpdateLoanStatus={handleUpdateLoanStatus}
                onDeleteLoan={handleDeleteLoan}
                onAdjustLoan={handleAdjustLoan}
                onSavePenalty={handleAddPenalty}
                onCancelPenalty={handleCancelPenalty}
                onDeletePenalty={handleDeletePenalty}
                onSaveTemporaryEarning={handleSaveTemporaryEarning}
                onCancelTemporaryEarning={handleCancelTemporaryEarning}
                onDeleteTemporaryEarning={handleDeleteTemporaryEarning}
              />
            )}

            {activeTab === 'settlements' && hasPermission(state.currentUser, 'MANAGE_PAYROLL') && (
              <PayrollSettlementsView
                company={activeCompany}
                employees={state.employees}
                payrollRuns={state.payrollRuns}
                settlements={state.payrollSettlements}
                attendance={state.attendance}
                loans={state.loans}
                penalties={state.penalties}
                temporaryEarnings={state.temporaryEarnings}
                activeRole={state.activeRole}
                onSaveSettlement={handleSavePayrollSettlement}
                onSavePayrollRun={handleSavePayrollRun}
              />
            )}

            {activeTab === 'journals' && hasPermission(state.currentUser, 'MANAGE_JOURNALS') && (
              <AccountingJournalsView
                company={activeCompany}
                payrollRuns={state.payrollRuns}
                journals={state.journals}
                activeRole={state.activeRole}
                onUpdateCompany={handleUpdateCompany}
                onOpenQoyodModal={() => setIsQoyodModalOpen(true)}
              />
            )}

            {activeTab === 'reports' && hasPermission(state.currentUser, 'VIEW_REPORTS') && (
              <ReportsView
                company={activeCompany}
                employees={state.employees}
                payrollRuns={state.payrollRuns}
                activeRole={state.activeRole}
              />
            )}

            {activeTab === 'users' && hasPermission(state.currentUser, 'MANAGE_USERS') && (
              <UserManagementView
                users={state.users}
                employees={state.employees}
                companies={state.companies}
                currentUser={state.currentUser}
                onSaveUser={handleSaveUser}
                onDeleteUser={handleDeleteUser}
              />
            )}

            {activeTab === 'settings' && hasPermission(state.currentUser, 'MANAGE_COMPANIES') && (
              <SettingsView
                companies={state.companies}
                activeCompany={activeCompany}
                employees={state.employees}
                users={state.users}
                currentUser={state.currentUser}
                activeRole={state.activeRole}
                onUpdateCompany={handleUpdateCompany}
                onAddCompany={handleAddCompany}
                onDeleteCompany={handleDeleteCompany}
                onSaveUser={handleSaveUser}
                onDeleteUser={handleDeleteUser}
                onSelectCompany={handleSelectCompany}
              />
            )}

            {activeTab === 'audit_logs' && hasPermission(state.currentUser, 'VIEW_AUDIT_LOGS') && (
              <AuditLogsView logs={state.auditLogs} />
            )}
          </div>
        </div>

      </main>

      {/* Printable Employee Statement & Payslip Modal */}
      <EmployeeStatementModal
        employee={statementEmployee}
        company={activeCompany}
        payrollRuns={state.payrollRuns}
        settlements={state.payrollSettlements}
        loans={state.loans}
        onClose={() => setStatementEmployee(null)}
      />

      {/* Qoyod Accounting Integration Modal */}
      {isQoyodModalOpen && (
        <QoyodIntegrationModal
          company={activeCompany}
          latestRun={latestCompanyRun}
          qoyodConfig={state.qoyodConfig}
          onSaveConfig={handleSaveQoyodConfig}
          onClose={() => setIsQoyodModalOpen(false)}
        />
      )}

      {/* Database Management & Diagnostics Modal */}
      {canViewDatabaseTools && (
        <DatabaseStatusModal
          isOpen={isDbModalOpen}
          onClose={() => setIsDbModalOpen(false)}
          state={state}
          dbStatus={dbStatus}
          onRestoreState={handleRestoreState}
        />
      )}

    </div>
  );
};

export default App;
