import React from 'react';
import { 
  Building2, 
  ChevronDown,
  RefreshCw,
  Zap,
  Layers,
  LogOut,
  UserCheck,
  Shield,
  Database,
  WifiOff,
  CheckCircle2
} from 'lucide-react';
import { Company, UserAccount, NavigationTab, UserRole } from '../types';
import { DatabaseStatus } from '../utils/databaseService';

interface NavbarProps {
  companies: Company[];
  activeCompany: Company;
  onSelectCompany: (companyId: string) => void;
  currentUser: UserAccount | null;
  dbStatus?: DatabaseStatus;
  onOpenDbModal?: () => void;
  onLogout: () => void;
  onOpenQoyodModal: () => void;
  onNavigate?: (tab: NavigationTab) => void;
  onResetData?: () => void;
}

const ROLE_LABELS: Record<UserRole, { label: string; color: string }> = {
  ADMIN: { label: 'مسؤول النظام', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  HR_MANAGER: { label: 'مدير الموارد البشرية', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  PAYROLL_SPECIALIST: { label: 'أخصائي الرواتب', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  AUDITOR: { label: 'المراجع الداخلي', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  COMPANY_MANAGER: { label: 'مدير الشركة', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  EMPLOYEE: { label: 'بوابة الموظف', color: 'bg-slate-100 text-slate-700 border-slate-200' },
};

export const Navbar: React.FC<NavbarProps> = ({
  companies,
  activeCompany,
  onSelectCompany,
  currentUser,
  dbStatus,
  onOpenDbModal,
  onLogout,
  onOpenQoyodModal,
  onNavigate,
  onResetData,
}) => {
  const roleInfo = currentUser ? ROLE_LABELS[currentUser.role] : ROLE_LABELS.ADMIN;

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sm:px-8 shadow-xs shrink-0 z-20">
      
      {/* Left: Summary Title & Company Badge */}
      <div className="flex items-center space-x-4 space-x-reverse min-w-0">
        <h2 className="text-base sm:text-lg font-semibold text-slate-800 truncate">
          ملخص الرواتب - مسار
        </h2>

        {/* Company Info Badge (Fixed per Login) */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/90 border border-slate-200 text-xs font-semibold text-slate-800">
          {activeCompany.logo ? (
            <img 
              src={activeCompany.logo} 
              alt={activeCompany.nameAr} 
              className="w-5 h-5 rounded-md object-contain bg-white border border-slate-200 shrink-0" 
            />
          ) : (
            <Building2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          )}
          <span className="truncate max-w-[150px] sm:max-w-[220px] font-bold text-slate-900">
            {activeCompany.nameAr}
          </span>
          <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold shrink-0">
            كود: {activeCompany.companyCode || '101'}
          </span>
        </div>

        {/* Database Connection Pill */}
        {onOpenDbModal && (
          <button
            onClick={onOpenDbModal}
            title="فحص حالة قاعدة البيانات والنسخ الاحتياطي"
            className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
              dbStatus?.isCloudConnected
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
            }`}
          >
            {dbStatus?.isCloudConnected ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-600" />
            )}
            <span className="text-[11px]">
              {dbStatus?.isCloudConnected ? 'قاعدة البيانات: متصلة سحابياً' : 'قاعدة البيانات: غير متصلة بالسحابة (محفوظة محلياً)'}
            </span>
          </button>
        )}
      </div>

      {/* Right: Actions & Logged-in User Profile */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        
        {/* Database Icon for small screens */}
        {onOpenDbModal && (
          <button
            onClick={onOpenDbModal}
            title="حالة قاعدة البيانات"
            className="lg:hidden p-2 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors cursor-pointer"
          >
            <Database className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Quick Action Buttons matching Professional Polish */}
        {onNavigate && (
          <button
            onClick={() => onNavigate('payroll_runs')}
            className="hidden md:inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs text-sm font-medium transition-colors cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>تشغيل مسير جديد</span>
          </button>
        )}

        {/* Real Logged In User Pill */}
        {currentUser && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200">
            <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">
              {currentUser.name.charAt(0)}
            </div>
            <div className="hidden sm:block text-right">
              <div className="text-xs font-bold text-slate-900 leading-tight">
                {currentUser.name}
              </div>
              <div className="text-[10px] text-slate-500 font-medium">
                {roleInfo.label}
              </div>
            </div>
          </div>
        )}

        {/* Logout Button */}
        <button
          onClick={onLogout}
          title="تسجيل الخروج من النظام"
          className="flex items-center gap-1 px-3 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200 text-xs font-bold transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">تسجيل الخروج</span>
        </button>

        {/* Reset Data Button */}
        {onResetData && (
          <button
            onClick={onResetData}
            title="إعادة ضبط البيانات"
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </header>
  );
};


