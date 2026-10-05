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
  ShieldCheck,
  UserCheck,
  LogOut,
  CalendarDays
} from 'lucide-react';
import { NavigationTab, UserRole, UserAccount, Company } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { hasPermission, TAB_PERMISSION } from '../utils/permissions';
import { WafrBrand } from './WafrBrand';

interface SidebarProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  employeesCount?: number;
  activeRole: UserRole;
  currentUser?: UserAccount | null;
  company?: Company | null;
  onLogout?: () => void;
}

const ROLE_DISPLAY: Record<UserRole, 'primarySystemAdmin' | 'generalManager' | 'operationsManager'> = {
  ADMIN: 'primarySystemAdmin',
  COMPANY_MANAGER: 'generalManager',
  OPERATIONS_MANAGER: 'operationsManager',
  EMPLOYEE: 'operationsManager',
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
  const { language, t } = useLanguage();
  const isAdmin = activeRole === 'ADMIN';

  const navItems: { id: NavigationTab; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean; managementOnly?: boolean }[] = [
    { id: 'dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { id: 'employees', label: `${t('employees')} (${employeesCount})`, icon: Users },
    { id: 'payroll_runs', label: t('payrollRuns'), icon: Banknote },
    { id: 'gosi', label: language === 'ar' ? 'التأمينات' : 'GOSI', icon: ShieldCheck },
    { id: 'attendance', label: t('attendance'), icon: Clock },
    { id: 'annual_leave', label: language === 'ar' ? 'الإجازات السنوية' : 'Annual Leave', icon: CalendarDays },
    { id: 'loans_penalties', label: t('loans'), icon: Receipt },
    { id: 'company_profile', label: t('companyProfile'), icon: Building2, managementOnly: true },
    { id: 'journals', label: t('journals'), icon: Layers, managementOnly: true },
    { id: 'reports', label: t('reports'), icon: BarChart3 },
    { id: 'users', label: t('users'), icon: UserCheck, adminOnly: true },
    { id: 'settings', label: t('settings'), icon: Settings, adminOnly: true },
    { id: 'audit_logs', label: t('audit'), icon: ShieldAlert, adminOnly: true },
  ];

  const visibleNavItems = navItems.filter(item => hasPermission(currentUser, TAB_PERMISSION[item.id]));
  const roleTitle = t(ROLE_DISPLAY[activeRole] || 'systemUser');
  const displayName = currentUser?.name || (isAdmin ? t('systemAdmin') : t('user'));
  const avatarLetter = currentUser?.name ? currentUser.name.charAt(0) : (language === 'ar' ? 'م' : 'U');

  return (
    <aside className="fixed inset-x-0 bottom-0 z-50 flex h-auto w-full shrink-0 flex-row border-t border-white/10 bg-[#0a1628]/95 text-white shadow-[0_-12px_40px_rgba(2,8,23,.22)] backdrop-blur-xl md:sticky md:top-0 md:z-auto md:h-screen md:w-72 md:flex-col md:border-t-0 md:bg-[#0a1628] md:shadow-2xl">
      {/* Brand Header: desktop only. On phones the bottom navigation keeps the workspace wide. */}
      <div className="hidden border-b border-white/10 p-5 md:block">
        <WafrBrand />
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[.055] p-2.5">
          {company?.logo ? <img src={company.logo} alt={company.nameAr} className="h-8 w-8 rounded-lg bg-white object-contain p-0.5" /> : <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300"><Building2 className="h-4 w-4" /></span>}
          <p className="min-w-0 truncate text-xs font-bold text-slate-200">{company ? (language === 'en' ? company.nameEn || company.nameAr : company.nameAr) : t('wageCompliance')}</p>
        </div>
      </div>

      {/* Navigation: vertical on desktop, horizontally scrollable bottom bar on mobile. */}
      <nav className="wafr-mobile-nav flex min-w-0 flex-1 gap-1 overflow-x-auto px-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-2 md:block md:space-y-1 md:overflow-y-auto md:p-4">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              data-testid={`nav-${item.id}`}
              onClick={() => onTabChange(item.id)}
              title={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-w-[76px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center text-[10px] transition-all cursor-pointer md:w-full md:min-w-0 md:flex-row md:justify-between md:p-3 md:text-right md:text-sm ${
                isActive
                  ? 'bg-emerald-500 text-[#071521] font-black shadow-lg shadow-emerald-950/30 md:translate-x-0.5'
                  : 'text-slate-300 hover:bg-white/[.07] hover:text-white'
              }`}
            >
              <div className="flex min-w-0 flex-col items-center gap-1 md:flex-row md:space-x-3 md:space-x-reverse">
                <Icon className="h-5 w-5 shrink-0 md:hidden" />
                <span 
                  className={`hidden w-2 h-2 rounded-full shrink-0 md:block ${
                    isActive ? 'bg-[#071521]' : 'bg-slate-500'
                  }`} 
                />
                <span className="max-w-[72px] truncate md:max-w-none">{item.label}</span>
              </div>
            </button>
          );
        })}
      </nav>

      {/* User Profile Footer: desktop only; mobile uses the top navbar for session actions. */}
      <div className="hidden p-4 border-t border-slate-700/80 bg-[#1e293b] space-y-2.5 md:block">
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
              title={t('logoutTitle')}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700/50 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Attribution */}
        <div className="text-center pt-1">
          <p className="text-[10px] text-slate-400 font-medium">
            {t('designedBy')} <span className="text-emerald-400 font-bold">Shadi Nassef</span>
          </p>
        </div>
      </div>
    </aside>
  );
};
