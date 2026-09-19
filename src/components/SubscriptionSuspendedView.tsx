import React from 'react';
import { Archive, Clock, Download, FileSpreadsheet, LogOut, ShieldAlert } from 'lucide-react';
import { Company, Employee, PayrollRun, UserRole } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { downloadCsvFile } from '../utils/exportUtils';
import { ReportsView } from './ReportsView';

interface SubscriptionSuspendedViewProps {
  company: Company;
  employees: Employee[];
  payrollRuns: PayrollRun[];
  activeRole: UserRole;
  backupData: Record<string, unknown>;
  developerContactPhone?: string;
  onLogout: () => void;
}

const csvCell = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';

export const SubscriptionSuspendedView: React.FC<SubscriptionSuspendedViewProps> = ({
  company,employees,payrollRuns,activeRole,backupData,developerContactPhone,onLogout,
}) => {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const text = (arabic: string, english: string) => ar ? arabic : english;
  const deletionDate = company.deletionScheduledAt
    ? new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-GB', { dateStyle:'long',timeZone:company.timezone || 'Asia/Riyadh' }).format(new Date(company.deletionScheduledAt))
    : text('سيتم تحديده قريبًا', 'Will be scheduled shortly');

  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify({ generatedAt:new Date().toISOString(),...backupData }, null, 2)], { type:'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Masar_Backup_${company.companyCode}_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadEmployees = () => {
    const headers = [
      text('الرقم الوظيفي','Employee No'),text('الاسم العربي','Arabic Name'),text('الاسم الإنجليزي','English Name'),
      text('الهوية أو الإقامة','ID / Iqama'),text('القسم','Department'),text('المسمى الوظيفي','Job Title'),
      text('الحالة','Status'),text('الراتب الأساسي','Base Salary'),text('الآيبان','IBAN'),
    ];
    const rows = employees.map(employee => [
      employee.employeeNo,`${employee.firstNameAr} ${employee.lastNameAr}`.trim(),
      `${employee.firstNameEn} ${employee.lastNameEn}`.trim(),employee.nationalIdOrIqama,
      employee.department,employee.jobTitle,employee.status,employee.salaryPackage.baseSalary,employee.bankIban,
    ]);
    downloadCsvFile(
      `Masar_Employees_${company.companyCode}_${new Date().toISOString().slice(0,10)}.csv`,
      [headers,...rows].map(row => row.map(csvCell).join(',')).join('\r\n'),
    );
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-7" dir={ar ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-amber-300 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><ShieldAlert className="h-7 w-7" /></div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-amber-700">{text('وضع القراءة والتصدير فقط','Read-only and export mode')}</p>
                <h1 className="mt-1 text-2xl font-black">{text('تم تعليق خدمات المنشأة لانتهاء الاشتراك','Company services are suspended because the subscription expired')}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                  {text('يمكنك مراجعة البيانات وتنزيل النسخ والمسيرات والتقارير، لكن لا يمكن إضافة أو تعديل أو حذف أي بيانات حتى تجديد الاشتراك.','You can review and download data, payrolls, and reports, but cannot add, edit, or delete data until the subscription is renewed.')}
                </p>
              </div>
            </div>
            <button type="button" onClick={onLogout} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <LogOut className="h-4 w-4" />{text('تسجيل الخروج','Sign out')}
            </button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-white p-4">
              <Clock className="h-5 w-5 text-amber-700" />
              <div><div className="text-xs text-slate-500">{text('موعد حذف البيانات من النظام','Scheduled system data deletion')}</div><div className="mt-1 font-black text-rose-700">{deletionDate}</div></div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
              {text('يُلغى الحذف تلقائيًا بمجرد تجديد الاشتراك قبل الموعد.','Deletion is cancelled automatically when the subscription is renewed before the deadline.')}
              {developerContactPhone && <a className="mt-1 block font-mono font-black" dir="ltr" href={`tel:${developerContactPhone}`}>{developerContactPhone}</a>}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <button type="button" onClick={downloadBackup} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-start shadow-sm hover:border-emerald-300">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Archive className="h-5 w-5" /></span>
            <span><strong className="block">{text('تنزيل نسخة كاملة من بيانات المنشأة','Download complete company data')}</strong><small className="mt-1 block text-slate-500">JSON</small></span>
            <Download className="ms-auto h-5 w-5 text-slate-400" />
          </button>
          <button type="button" onClick={downloadEmployees} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-start shadow-sm hover:border-emerald-300">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><FileSpreadsheet className="h-5 w-5" /></span>
            <span><strong className="block">{text('تنزيل ملف الموظفين','Download employee file')}</strong><small className="mt-1 block text-slate-500">Excel / CSV</small></span>
            <Download className="ms-auto h-5 w-5 text-slate-400" />
          </button>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <ReportsView company={company} employees={employees} payrollRuns={payrollRuns} activeRole={activeRole} />
        </section>
      </div>
    </main>
  );
};
