import React, { useState, useEffect, useMemo } from 'react';
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
  AttendanceRecord, 
  LeaveRequest, 
  LoanSchedule, 
  PenaltyRecord, 
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
import { hasPermission, TAB_PERMISSION } from './utils/permissions';
import { Sidebar } from './components/Sidebar';
import { LoginView } from './components/LoginView';
import { UserManagementView } from './components/UserManagementView';
import { DashboardView } from './components/DashboardView';
import { EmployeesView } from './components/EmployeesView';
import { PayrollRunsView } from './components/PayrollRunsView';
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

export const App: React.FC = () => {
  const { t } = useLanguage();
  // Initialize full application state
  const [state, setState] = useState(() => loadInitialState());

  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [statementEmployee, setStatementEmployee] = useState<Employee | null>(null);
  const [isQoyodModalOpen, setIsQoyodModalOpen] = useState(false);
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  const [showDbWarningBanner, setShowDbWarningBanner] = useState(true);
  const [authReady, setAuthReady] = useState(false);

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
    setDbStatus(prev => ({ ...prev, isChecking: true }));
    api.health()
      .then(() => {
        if (!cancelled) setDbStatus(prev => ({ ...prev, isCloudConnected: true, isChecking: false, lastError: null }));
      })
      .catch((error: any) => {
        if (!cancelled) setDbStatus(prev => ({ ...prev, isCloudConnected: false, isChecking: false, lastError: error?.message || 'تعذر الاتصال بقاعدة البيانات' }));
      });
    return () => { cancelled = true; };
  }, [state.currentUser?.id]);

  // Debounced central PostgreSQL persistence for authenticated sessions.
  useEffect(() => {
    if (!state.currentUser) return;
    const timer = window.setTimeout(async () => {
      try {
        await api.saveState(state);
        const status = await persistFullStateToDatabase(state);
        setDbStatus({ ...status, lastError: null });
      } catch (error: any) {
        try {
          await api.health();
          setDbStatus(prev => ({ ...prev, isCloudConnected: true, isChecking: false, lastError: `تعذر حفظ آخر تعديل: ${error?.message || 'خطأ غير معروف'}` }));
        } catch {
          setDbStatus(prev => ({ ...prev, isCloudConnected: false, isChecking: false, lastError: error?.message || 'تعذر الاتصال بقاعدة البيانات' }));
        }
      }
    }, 750);
    return () => window.clearTimeout(timer);
  }, [state]);

  // Active Company
  const activeCompany = useMemo(() => {
    return state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];
  }, [state.companies, state.activeCompanyId]);

  useEffect(() => {
    if (state.currentUser && !hasPermission(state.currentUser, TAB_PERMISSION[activeTab])) {
      const fallback = (Object.keys(TAB_PERMISSION) as NavigationTab[]).find(tab => hasPermission(state.currentUser, TAB_PERMISSION[tab]));
      if (fallback) setActiveTab(fallback);
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
          action: 'تسجيل الخروج من النظام',
          entityType: 'AUTH',
          entityId: prev.currentUser.id,
          details: `تم تسجيل الخروج بنجاح للمستخدم ${prev.currentUser.username}`,
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
      alert('لا يمكن تعديل مدير النظام الأساسي، وإدارة المستخدمين متاحة للإدارة فقط.');
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
        action: exists ? 'تعديل بيانات وصلاحيات مستخدم' : 'إنشاء حساب مستخدم جديد',
        entityType: 'USER',
        entityId: user.id,
        details: `المستخدم: ${user.name} (${user.username}) - الدور: ${user.role}`,
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
      alert('لا يمكن حذف مدير النظام الأساسي، وإدارة المستخدمين متاحة للإدارة فقط.');
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
        action: 'حذف حساب مستخدم',
        entityType: 'USER',
        entityId: userId,
        details: `تم حذف حساب المستخدم: ${targetUser?.name || userId}`,
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
      const next = { ...prev, activeCompanyId: companyId };
      saveActiveCompanyId(companyId);
      return next;
    });
  };

  const handleSaveEmployee = (employee: Employee) => {
    setState(prev => {
      const exists = prev.employees.some(e => e.id === employee.id);
      const updated = exists 
        ? prev.employees.map(e => e.id === employee.id ? employee : e)
        : [employee, ...prev.employees];
      
      saveEmployees(updated);

      const log: AuditLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userName: prev.currentUser?.name || 'المدير العام',
        userRole: prev.activeRole,
        action: exists ? 'تعديل بيانات موظف' : 'إضافة موظف جديد',
        entityType: 'EMPLOYEE',
        entityId: employee.id,
        details: `الموظف: ${employee.firstNameAr} ${employee.lastNameAr} (${employee.employeeNo})`,
      };
      const updatedLogs = [log, ...prev.auditLogs];
      saveAuditLogs(updatedLogs);

      return {
        ...prev,
        employees: updated,
        auditLogs: updatedLogs,
      };
    });
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
        action: 'استيراد موظفين من ملف',
        entityType: 'EMPLOYEE',
        entityId: importedEmployees[0].companyId,
        details: `تم استيراد ${importedEmployees.length} موظف من Excel/CSV`,
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
        action: 'مسح جميع موظفي المنشأة',
        entityType: 'COMPANY',
        entityId: companyId,
        details: `تم حذف ${deletedEmployees.length} موظفًا وجميع بيانات الحضور والإجازات والسلف والجزاءات والمسيرات والقيود المرتبطة بهم`,
      };
      const auditLogs = [log, ...prev.auditLogs];
      saveAuditLogs(auditLogs);

      return { ...prev, employees, attendance, leaves, loans, penalties, payrollRuns, journals, users, auditLogs };
    });
  };

  const handleSavePayrollRun = (run: PayrollRun) => {
    setState(prev => {
      const previousRun = prev.payrollRuns.find(r => r.id === run.id);
      const exists = Boolean(previousRun);
      const updated = exists
        ? prev.payrollRuns.map(r => r.id === run.id ? run : r)
        : [run, ...prev.payrollRuns];

      savePayrollRuns(updated);

      const previousBatches = previousRun?.paymentBatches || [];
      const currentBatches = run.paymentBatches || [];
      const createdBatch = currentBatches.find(batch => !previousBatches.some(previous => previous.id === batch.id));
      const changedBatch = currentBatches.find(batch => {
        const previous = previousBatches.find(candidate => candidate.id === batch.id);
        return previous && previous.status !== batch.status;
      });
      const adjustedItem = run.items.find(item => {
        const previous = previousRun?.items.find(candidate => candidate.id === item.id);
        return previous && (
          (previous.manualAddition || 0) !== (item.manualAddition || 0) ||
          (previous.manualDeduction || 0) !== (item.manualDeduction || 0) ||
          (previous.adjustmentNotes || '') !== (item.adjustmentNotes || '')
        );
      });
      const entitlementChangedItem = run.items.find(item => {
        const previous = previousRun?.items.find(candidate => candidate.id === item.id);
        return previous && (previous.entitlementStatus || 'PAYABLE') !== (item.entitlementStatus || 'PAYABLE');
      });

      let auditAction = `تحديث مسير الرواتب (${run.status})`;
      let auditDetails = `مسير فترة ${run.periodMonth} - إجمالي الصافي: ${run.totalNetSalaries.toLocaleString()} SAR`;

      if (previousRun?.status === 'POSTED' && run.status === 'UNDER_REVIEW') {
        auditAction = 'التراجع عن ترحيل مسير الرواتب';
        auditDetails = `فتح مسير ${run.periodMonth} المرحل للتعديل وإعادة الاعتماد - الصافي ${run.totalNetSalaries.toLocaleString()} SAR`;
      } else if (previousRun?.status === 'APPROVED' && run.status === 'UNDER_REVIEW') {
        auditAction = 'التراجع عن اعتماد مسير الرواتب';
        auditDetails = `فتح مسير ${run.periodMonth} للتعديل وإعادة الاعتماد - الصافي ${run.totalNetSalaries.toLocaleString()} SAR`;
      } else if (entitlementChangedItem) {
        auditAction = 'تغيير حالة استحقاق راتب موظف';
        auditDetails = `${entitlementChangedItem.employeeName} (${entitlementChangedItem.employeeNo}) - الحالة: ${entitlementChangedItem.entitlementStatus || 'PAYABLE'} - ${entitlementChangedItem.entitlementReason || 'بدون سبب'}`;
      } else if (adjustedItem) {
        auditAction = 'تعديل إضافات وخصومات موظف في المسير';
        auditDetails = `${adjustedItem.employeeName} (${adjustedItem.employeeNo}) - إضافة ${(adjustedItem.manualAddition || 0).toLocaleString()} - خصم ${(adjustedItem.manualDeduction || 0).toLocaleString()} SAR - ${adjustedItem.adjustmentNotes || 'بدون ملاحظات'}`;
      } else if (createdBatch) {
        auditAction = 'إنشاء دفعة تحويل رواتب';
        auditDetails = `${createdBatch.batchNumber} - ${createdBatch.employeesCount} موظف - ${createdBatch.totalAmount.toLocaleString()} SAR - الحالة: ${createdBatch.status}`;
      } else if (changedBatch) {
        auditAction = 'تحديث حالة دفعة تحويل رواتب';
        auditDetails = `${changedBatch.batchNumber} - الحالة الجديدة: ${changedBatch.status} - ${changedBatch.totalAmount.toLocaleString()} SAR`;
      }

      const log: AuditLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userName: prev.currentUser?.name || 'مسؤول الرواتب',
        userRole: prev.activeRole,
        action: auditAction,
        entityType: 'PAYROLL_RUN',
        entityId: run.id,
        details: auditDetails,
      };
      const updatedLogs = [log, ...prev.auditLogs];
      saveAuditLogs(updatedLogs);

      return {
        ...prev,
        payrollRuns: updated,
        auditLogs: updatedLogs,
      };
    });
  };

  const handleAddAttendance = (record: AttendanceRecord) => {
    setState(prev => {
      const updated = prev.attendance.some(item => item.id === record.id)
        ? prev.attendance.map(item => item.id === record.id ? record : item)
        : [record, ...prev.attendance];
      saveAttendance(updated);
      return { ...prev, attendance: updated };
    });
  };

  const handleBulkImportAttendance = (records: AttendanceRecord[]) => {
    setState(prev => {
      const updated = [...records, ...prev.attendance];
      saveAttendance(updated);
      return { ...prev, attendance: updated };
    });
  };

  const handleDeleteAttendance = (recordId: string) => {
    setState(prev => {
      const record = prev.attendance.find(item => item.id === recordId);
      const updated = prev.attendance.filter(item => item.id !== recordId);
      saveAttendance(updated);
      if (!record) return { ...prev, attendance: updated };
      const employee = prev.employees.find(item => item.id === record.employeeId);
      const log: AuditLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userName: prev.currentUser?.name || 'مسؤول الموارد البشرية',
        userRole: prev.activeRole,
        action: record.absence ? 'إلغاء غياب مسجل' : 'حذف حركة حضور',
        entityType: 'EMPLOYEE',
        entityId: record.employeeId,
        details: `${employee ? `${employee.firstNameAr} ${employee.lastNameAr}` : record.employeeId} - ${record.date}`,
      };
      const auditLogs = [log, ...prev.auditLogs];
      saveAuditLogs(auditLogs);
      return { ...prev, attendance: updated, auditLogs };
    });
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

  const handleAddLoan = (loan: LoanSchedule) => {
    setState(prev => {
      const updated = prev.loans.some(item => item.id === loan.id)
        ? prev.loans.map(item => item.id === loan.id ? loan : item)
        : [loan, ...prev.loans];
      saveLoans(updated);
      return { ...prev, loans: updated };
    });
  };

  const handleUpdateLoanStatus = (loanId: string, status: LoanSchedule['status']) => {
    setState(prev => {
      const updated = prev.loans.map(l => l.id === loanId ? { ...l, status } : l);
      saveLoans(updated);
      return { ...prev, loans: updated };
    });
  };

  const handleDeleteLoan = (loanId: string) => {
    setState(prev => {
      const updated = prev.loans.filter(item => item.id !== loanId);
      saveLoans(updated);
      return { ...prev, loans: updated };
    });
  };

  const handleAddPenalty = (penalty: PenaltyRecord) => {
    setState(prev => {
      const updated = prev.penalties.some(item => item.id === penalty.id)
        ? prev.penalties.map(item => item.id === penalty.id ? penalty : item)
        : [penalty, ...prev.penalties];
      savePenalties(updated);
      return { ...prev, penalties: updated };
    });
  };

  const handleCancelPenalty = (penaltyId: string) => {
    setState(prev => {
      const updated = prev.penalties.map(item => item.id === penaltyId ? { ...item, appliedInPayroll: false } : item);
      savePenalties(updated);
      return { ...prev, penalties: updated };
    });
  };

  const handleDeletePenalty = (penaltyId: string) => {
    setState(prev => {
      const updated = prev.penalties.filter(item => item.id !== penaltyId);
      savePenalties(updated);
      return { ...prev, penalties: updated };
    });
  };

  const handleDeleteEmployee = (empId: string) => {
    setState(prev => {
      const targetEmp = prev.employees.find(e => e.id === empId);
      const updated = prev.employees.filter(e => e.id !== empId);
      saveEmployees(updated);

      const log: AuditLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userName: prev.currentUser?.name || 'المدير العام',
        userRole: prev.activeRole,
        action: 'حذف موظف',
        entityType: 'EMPLOYEE',
        entityId: empId,
        details: `تم حذف الموظف: ${targetEmp ? `${targetEmp.firstNameAr} ${targetEmp.lastNameAr}` : empId}`,
      };
      const updatedLogs = [log, ...prev.auditLogs];
      saveAuditLogs(updatedLogs);

      return {
        ...prev,
        employees: updated,
        auditLogs: updatedLogs,
      };
    });
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
        action: 'إضافة منشأة / شركة جديدة',
        entityType: 'COMPANY',
        entityId: company.id,
        details: `تمت إضافة الشركة: ${company.nameAr} (كود: ${company.companyCode})`,
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
        action: 'تعديل بيانات المنشأة',
        entityType: 'COMPANY',
        entityId: company.id,
        details: `تم تعديل بيانات الشركة: ${company.nameAr} (كود: ${company.companyCode})`,
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
        alert('لا يمكن حذف الشركة الوحيدة المتبقية في النظام.');
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
        action: 'حذف منشأة / شركة',
        entityType: 'COMPANY',
        entityId: companyId,
        details: `تم حذف الشركة: ${targetComp?.nameAr || companyId}`,
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
    const fresh = resetToCleanState();
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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f8fafc] font-sans antialiased text-slate-900 selection:bg-emerald-500 selection:text-white">
      
      {/* Dark Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
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
          companies={state.companies}
          activeCompany={activeCompany}
          currentUser={state.currentUser}
          dbStatus={dbStatus}
          onOpenDbModal={() => setIsDbModalOpen(true)}
          onSelectCompany={handleSelectCompany}
          onLogout={handleLogout}
          onOpenQoyodModal={() => setIsQoyodModalOpen(true)}
          onNavigate={setActiveTab}
          onResetData={handleResetData}
        />

        {/* Database Status Notification Banner (Shows when cloud DB is disconnected) */}
        {!dbStatus.isChecking && !dbStatus.isCloudConnected && showDbWarningBanner && (
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
                onNavigate={setActiveTab}
                onViewEmployeeStatement={setStatementEmployee}
                onOpenQoyodModal={() => setIsQoyodModalOpen(true)}
              />
            )}

            {activeTab === 'company_profile' && hasPermission(state.currentUser, 'MANAGE_COMPANY_PROFILE') && (
              <CompanyProfileView
                company={activeCompany}
                allCompanies={state.companies}
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
                activeRole={state.activeRole}
                permissions={state.currentUser?.permissions}
                onSavePayrollRun={handleSavePayrollRun}
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
                activeRole={state.activeRole}
                onSaveLoan={handleAddLoan}
                onUpdateLoanStatus={handleUpdateLoanStatus}
                onDeleteLoan={handleDeleteLoan}
                onSavePenalty={handleAddPenalty}
                onCancelPenalty={handleCancelPenalty}
                onDeletePenalty={handleDeletePenalty}
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
      <DatabaseStatusModal
        isOpen={isDbModalOpen}
        onClose={() => setIsDbModalOpen(false)}
        state={state}
        dbStatus={dbStatus}
        onRestoreState={handleRestoreState}
      />

    </div>
  );
};

export default App;
