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
  saveActiveCompanyId, 
  saveActiveRole,
  saveUsers,
  saveCurrentUser,
  resetToCleanState
} from './utils/storage';
import { Navbar } from './components/Navbar';
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
import { AuditLogsView } from './components/AuditLogsView';
import { EmployeeStatementModal } from './components/EmployeeStatementModal';
import { QoyodIntegrationModal } from './components/QoyodIntegrationModal';

export const App: React.FC = () => {
  // Initialize full application state
  const [state, setState] = useState(() => loadInitialState());

  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [statementEmployee, setStatementEmployee] = useState<Employee | null>(null);
  const [isQoyodModalOpen, setIsQoyodModalOpen] = useState(false);

  // Active Company
  const activeCompany = useMemo(() => {
    return state.companies.find(c => c.id === state.activeCompanyId) || state.companies[0];
  }, [state.companies, state.activeCompanyId]);

  // Auth handlers
  const handleLogin = (user: UserAccount, selectedCompanyId: string) => {
    const updatedUser = {
      ...user,
      lastLogin: new Date().toISOString(),
    };

    const targetCompanyId = selectedCompanyId || (user.companyIds.length > 0 ? user.companyIds[0] : state.companies[0].id);
    
    setState(prev => {
      const updatedUsers = prev.users.map(u => u.id === user.id ? updatedUser : u);
      saveUsers(updatedUsers);
      saveCurrentUser(updatedUser);
      saveActiveRole(user.role);
      saveActiveCompanyId(targetCompanyId);

      const targetCompany = prev.companies.find(c => c.id === targetCompanyId);

      const log: AuditLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userName: user.name,
        userRole: user.role,
        action: 'تسجيل الدخول للنظام',
        entityType: 'AUTH',
        entityId: user.id,
        details: `تم تسجيل الدخول بنجاح للمستخدم ${user.username} إلى المنشأة: ${targetCompany?.nameAr || targetCompanyId}`,
      };
      const updatedLogs = [log, ...prev.auditLogs];
      saveAuditLogs(updatedLogs);

      return {
        ...prev,
        currentUser: updatedUser,
        users: updatedUsers,
        activeCompanyId: targetCompanyId,
        activeRole: user.role,
        auditLogs: updatedLogs,
      };
    });
  };

  const handleLogout = () => {
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

  // User Management handlers
  const handleSaveUser = (user: UserAccount) => {
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

  const handleDeleteUser = (userId: string) => {
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

  const handleSavePayrollRun = (run: PayrollRun) => {
    setState(prev => {
      const exists = prev.payrollRuns.some(r => r.id === run.id);
      const updated = exists
        ? prev.payrollRuns.map(r => r.id === run.id ? run : r)
        : [run, ...prev.payrollRuns];

      savePayrollRuns(updated);

      const log: AuditLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userName: prev.currentUser?.name || 'مسؤول الرواتب',
        userRole: prev.activeRole,
        action: `تحديث مسير الرواتب (${run.status})`,
        entityType: 'PAYROLL_RUN',
        entityId: run.id,
        details: `مسير فترة ${run.periodMonth} - إجمالي الصافي: ${run.totalNetSalaries.toLocaleString()} SAR`,
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
      const updated = [record, ...prev.attendance];
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

  const handleUpdateLeaveStatus = (leaveId: string, status: 'APPROVED' | 'REJECTED') => {
    setState(prev => {
      const updated = prev.leaves.map(l => l.id === leaveId ? { ...l, status } : l);
      saveLeaves(updated);
      return { ...prev, leaves: updated };
    });
  };

  const handleAddLeave = (leave: LeaveRequest) => {
    setState(prev => {
      const updated = [leave, ...prev.leaves];
      saveLeaves(updated);
      return { ...prev, leaves: updated };
    });
  };

  const handleAddLoan = (loan: LoanSchedule) => {
    setState(prev => {
      const updated = [loan, ...prev.loans];
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

  const handleAddPenalty = (penalty: PenaltyRecord) => {
    setState(prev => {
      const updated = [penalty, ...prev.penalties];
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
    setState(prev => {
      const updated = prev.companies.map(c => c.id === company.id ? company : c);
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

      return { ...prev, companies: updated, auditLogs: updatedLogs };
    });
  };

  const handleDeleteCompany = (companyId: string) => {
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

  // If not logged in, show real Login View
  if (!state.currentUser) {
    return <LoginView users={state.users} companies={state.companies} onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f8fafc] font-sans antialiased text-slate-900 selection:bg-emerald-500 selection:text-white" dir="rtl">
      
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
          onSelectCompany={handleSelectCompany}
          onLogout={handleLogout}
          onOpenQoyodModal={() => setIsQoyodModalOpen(true)}
          onNavigate={setActiveTab}
          onResetData={handleResetData}
        />

        {/* Scrollable Workspace Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="max-w-7xl mx-auto w-full">
            {activeTab === 'dashboard' && (
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

            {activeTab === 'employees' && (
              <EmployeesView
                company={activeCompany}
                employees={state.employees}
                loans={state.loans}
                activeRole={state.activeRole}
                onSaveEmployee={handleSaveEmployee}
                onViewStatement={setStatementEmployee}
              />
            )}

            {activeTab === 'payroll_runs' && (
              <PayrollRunsView
                company={activeCompany}
                employees={state.employees}
                payrollRuns={state.payrollRuns}
                attendance={state.attendance}
                loans={state.loans}
                penalties={state.penalties}
                activeRole={state.activeRole}
                onSavePayrollRun={handleSavePayrollRun}
                onViewEmployeeStatement={setStatementEmployee}
                onOpenQoyodModal={() => setIsQoyodModalOpen(true)}
              />
            )}

            {activeTab === 'attendance' && (
              <AttendanceLeavesView
                company={activeCompany}
                employees={state.employees}
                attendance={state.attendance}
                leaves={state.leaves}
                activeRole={state.activeRole}
                onAddAttendance={handleAddAttendance}
                onBulkImportAttendance={handleBulkImportAttendance}
                onUpdateLeaveStatus={handleUpdateLeaveStatus}
                onAddLeave={handleAddLeave}
              />
            )}

            {activeTab === 'loans_penalties' && (
              <LoansPenaltiesView
                company={activeCompany}
                employees={state.employees}
                loans={state.loans}
                penalties={state.penalties}
                activeRole={state.activeRole}
                onAddLoan={handleAddLoan}
                onUpdateLoanStatus={handleUpdateLoanStatus}
                onAddPenalty={handleAddPenalty}
              />
            )}

            {activeTab === 'journals' && (
              <AccountingJournalsView
                company={activeCompany}
                payrollRuns={state.payrollRuns}
                journals={state.journals}
                activeRole={state.activeRole}
                onUpdateCompany={handleUpdateCompany}
                onOpenQoyodModal={() => setIsQoyodModalOpen(true)}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsView
                company={activeCompany}
                employees={state.employees}
                payrollRuns={state.payrollRuns}
                activeRole={state.activeRole}
              />
            )}

            {activeTab === 'users' && (
              <UserManagementView
                users={state.users}
                employees={state.employees}
                companies={state.companies}
                currentUser={state.currentUser}
                onSaveUser={handleSaveUser}
                onDeleteUser={handleDeleteUser}
              />
            )}

            {activeTab === 'settings' && (
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

            {activeTab === 'audit_logs' && (
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

    </div>
  );
};

export default App;

