import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Banknote, 
  Clock, 
  Receipt, 
  Layers, 
  BarChart3, 
  Settings, 
  Building2,
  ShieldAlert,
  UserCheck,
  LogOut
} from 'lucide-react';
import { NavigationTab, UserRole, UserAccount, Company } from '../types';

interface SidebarProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  employeesCount?: number;
  activeRole: UserRole;
  currentUser?: UserAccount | null;
  company?: Company | null;
  onLogout?: () => void;
}

const ROLE_DISPLAY: Record<UserRole, { title: string }> = {
  ADMIN: { title: 'مسؤول النظام الرئيسي' },
  HR_MANAGER: { title: 'مدير الموارد البشرية' },
  PAYROLL_SPECIALIST: { title: 'أخصائي الرواتب والمحاسب' },
  AUDITOR: { title: 'المراجع الداخلي والمدقق' },
  COMPANY_MANAGER: { title: 'المدير التنفيذي' },
  EMPLOYEE: { title: 'بوابة الموظف' },
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  employeesCount = 0,
  activeRole,
  currentUser,
  company,
  onLogout,
}) => {
  const isAdmin = activeRole === 'ADMIN';

  const navItems: { id: NavigationTab; labelAr: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean }[] = [
    {
      id: 'dashboard',
      labelAr: 'لوحة التحكم',
      icon: LayoutDashboard,
    },
    {
      id: 'company_profile',
      labelAr: 'ملف المنشأة',
      icon: Building2,
    },
    {
      id: 'payroll_runs',
      labelAr: 'مسيرات الرواتب',
      icon: Banknote,
    },
    {
      id: 'employees',
      labelAr: `الموظفين (${employeesCount})`,
      icon: Users,
    },
    {
      id: 'attendance',
      labelAr: 'الحضور والإجازات',
      icon: Clock,
    },
    {
      id: 'loans_penalties',
      labelAr: 'السلف والخصومات',
      icon: Receipt,
    },
    {
      id: 'journals',
      labelAr: 'القيود وتكامل قيود',
      icon: Layers,
    },
    {
      id: 'reports',
      labelAr: 'التقارير والإحصائيات',
      icon: BarChart3,
    },
    {
      id: 'users',
      labelAr: 'المستخدمين والصلاحيات',
      icon: UserCheck,
      adminOnly: true,
    },
    {
      id: 'settings',
      labelAr: 'إدارة الشركات والمنشآت',
      icon: Settings,
      adminOnly: true,
    },
    {
      id: 'audit_logs',
      labelAr: 'سجل التدقيق والأمان',
      icon: ShieldAlert,
      adminOnly: true,
    },
  ];

  const visibleNavItems = navItems.filter(item => !item.adminOnly || isAdmin);
  const roleTitle = ROLE_DISPLAY[activeRole]?.title || 'مستخدم النظام';
  const displayName = currentUser?.name || (isAdmin ? 'مسؤول النظام' : 'المستخدم');
  const avatarLetter = currentUser?.name ? currentUser.name.charAt(0) : 'م';

  return (
    <aside className="w-64 bg-[#1e293b] text-white flex flex-col shadow-xl shrink-0 h-screen sticky top-0">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-700/80">
        <div className="flex items-center gap-3">
          {company?.logo ? (
            <div className="w-10 h-10 rounded-xl bg-white p-1 border border-slate-600 shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
              <img 
                src={company.logo} 
                alt={company.nameAr} 
                className="w-full h-full object-contain" 
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-emerald-600 border border-emerald-500/40 shadow-sm flex items-center justify-center text-white shrink-0 font-bold">
              <Building2 className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-white truncate">
              نظام مسار <span className="text-emerald-400">للرواتب</span>
            </h1>
            <p className="text-[11px] text-slate-400 truncate font-medium">
              {company ? company.nameAr : 'إدارة الأجور والامتثال'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between p-3 rounded-lg text-sm transition-colors text-right cursor-pointer ${
                isActive
                  ? 'bg-emerald-600 text-white font-medium shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-3 space-x-reverse min-w-0">
                <span 
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isActive ? 'bg-white' : 'bg-slate-500'
                  }`} 
                />
                <span className="truncate">{item.labelAr}</span>
              </div>
            </button>
          );
        })}
      </nav>

      {/* User Profile Footer */}
      <div className="p-4 border-t border-slate-700/80 bg-[#1e293b] space-y-2.5">
        <div className="flex items-center justify-between p-2.5 bg-slate-800/90 rounded-xl border border-slate-700/60">
          <div className="flex items-center min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-white shrink-0 shadow-sm text-xs">
              {avatarLetter}
            </div>
            <div className="mr-2.5 overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{displayName}</p>
              <p className="text-[10px] text-slate-400 truncate">{roleTitle}</p>
            </div>
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              title="تسجيل الخروج"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700/50 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Attribution */}
        <div className="text-center pt-1">
          <p className="text-[10px] text-slate-400 font-medium">
            تم التصميم بواسطة الأستاذ: <span className="text-emerald-400 font-bold">Shadi Nassef</span>
          </p>
        </div>
      </div>
    </aside>
  );
};

