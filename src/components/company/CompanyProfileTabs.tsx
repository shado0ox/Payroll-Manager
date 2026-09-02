import React from 'react';
import { AlertCircle, Building2, CreditCard, FolderTree, Layers, Settings2, Sliders, Sparkles, Users } from 'lucide-react';
import type { UserAccount } from '../../types';
import { hasPermission } from '../../utils/permissions';

export type ProfileSubTab = 'details' | 'banking' | 'qoyod' | 'users' | 'departments' | 'cost_centers' | 'policies' | 'accounts' | 'danger';

interface Props {
  activeTab: ProfileSubTab;
  currentUser?: UserAccount | null;
  userCount: number;
  departmentCount: number;
  costCenterCount: number;
  onChange: (tab: ProfileSubTab) => void;
  tr: (ar: string, en: string) => string;
}

export const CompanyProfileTabs = React.memo(function CompanyProfileTabs({ activeTab, currentUser, userCount, departmentCount, costCenterCount, onChange, tr }: Props) {
  const tabs = [
    ['details', Building2, tr('البيانات الأساسية والحكومية', 'Company & government details')],
    ['banking', CreditCard, tr('الحساب البنكي والسويفت (WPS)', 'Banking & SWIFT (WPS)')],
    ...(hasPermission(currentUser, 'MANAGE_JOURNALS') ? [['qoyod', Sparkles, tr('تكامل برنامج قيود (Qoyod API)', 'Qoyod integration (API)')]] : []),
    ...(hasPermission(currentUser, 'MANAGE_USERS') ? [['users', Users, tr('المستخدمون المفوضون', 'Authorized users') + ' (' + userCount + ')']] : []),
    ['departments', FolderTree, tr('الأقسام الإدارية', 'Departments') + ' (' + departmentCount + ')'],
    ['cost_centers', Layers, tr('مراكز التكلفة', 'Cost centers') + ' (' + costCenterCount + ')'],
    ['policies', Sliders, tr('قواعد الاحتساب والتأمينات (GOSI)', 'Calculation rules & GOSI')],
    ['accounts', Settings2, tr('شجرة الحسابات', 'Chart of accounts')],
    ...(hasPermission(currentUser, 'MANAGE_EMPLOYEES') ? [['danger', AlertCircle, tr('إدارة البيانات الحساسة', 'Sensitive data')]] : []),
  ] as const;
  return <div className="flex items-center gap-1.5 mt-6 pt-4 border-t border-slate-100 overflow-x-auto pb-1">{tabs.map(([id, Icon, label]) => {
    const danger = id === 'danger';
    return <button key={id} onClick={() => onChange(id)} className={'px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer ' + (activeTab === id ? (danger ? 'bg-rose-700 text-white shadow-sm' : 'bg-slate-900 text-white shadow-sm') : (danger ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-600 hover:bg-slate-100'))}><Icon className={'w-4 h-4 ' + (id === 'qoyod' ? 'text-sky-400' : '')} /><span>{label}</span></button>;
  })}</div>;
});
