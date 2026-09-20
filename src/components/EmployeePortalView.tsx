import React, { useEffect, useState } from 'react';
import { CalendarDays, Clock3, FileText, LogOut, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { api, type EmployeePortalProfile } from '../utils/api';
import { useLanguage } from '../i18n/LanguageContext';

type Props = { onLogout:() => void };

export const EmployeePortalView: React.FC<Props> = ({ onLogout }) => {
  const { language } = useLanguage();
  const [data,setData] = useState<EmployeePortalProfile | null>(null);
  const [error,setError] = useState('');

  const load = () => {
    setError('');
    api.employeePortalMe().then(setData).catch((reason:any) => setError(String(reason?.message || 'EMPLOYEE_PORTAL_LOAD_FAILED')));
  };
  useEffect(load,[]);

  if (!data) return <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
    <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
      {error ? <>
        <ShieldCheck className="mx-auto h-10 w-10 text-rose-400" />
        <h1 className="mt-4 text-lg font-black">{language === 'ar' ? 'تعذر فتح بوابة الموظف' : 'Employee portal unavailable'}</h1>
        <p className="mt-2 text-sm text-slate-400">{error}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={load} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold"><RefreshCw className="me-2 inline h-4 w-4" />{language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button>
          <button onClick={onLogout} className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold">{language === 'ar' ? 'تسجيل الخروج' : 'Sign out'}</button>
        </div>
      </> : <div className="flex items-center justify-center gap-3 text-sm font-bold"><RefreshCw className="h-5 w-5 animate-spin text-emerald-400" />{language === 'ar' ? 'جارٍ تحميل بياناتك الآمنة...' : 'Loading your secure profile...'}</div>}
    </div>
  </div>;

  const { profile,company,subscription } = data;
  const name = language === 'ar'
    ? `${profile.firstNameAr} ${profile.lastNameAr}`.trim()
    : (`${profile.firstNameEn} ${profile.lastNameEn}`.trim() || `${profile.firstNameAr} ${profile.lastNameAr}`.trim());
  const cards = [
    { icon:FileText,titleAr:'الرواتب المدفوعة',titleEn:'Paid salaries',textAr:'قسائم الرواتب والخصومات بعد تأكيد الدفع',textEn:'Payslips and deductions after payment confirmation' },
    { icon:Clock3,titleAr:'الحضور والغياب',titleEn:'Attendance',textAr:'الحضور والتأخير والغياب المسجل',textEn:'Recorded attendance, delay, and absence' },
    { icon:CalendarDays,titleAr:'الإجازات',titleEn:'Leave',textAr:'الرصيد والطلبات وسجل الإجازات',textEn:'Balance, requests, and leave history' },
  ];

  return <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-100 text-slate-900">
    <header className="border-b border-slate-800 bg-slate-950 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-emerald-500/15 text-emerald-400">
            {company.logo ? <img src={company.logo} alt="" className="h-full w-full object-contain" /> : <ShieldCheck className="h-6 w-6" />}
          </div>
          <div><div className="text-sm font-black">{language === 'ar' ? company.nameAr : company.nameEn || company.nameAr}</div><div className="text-xs text-slate-400">{language === 'ar' ? 'بوابة الموظف' : 'Employee Portal'}</div></div>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold hover:bg-slate-800"><LogOut className="h-4 w-4" />{language === 'ar' ? 'خروج' : 'Sign out'}</button>
      </div>
    </header>

    <main className="mx-auto max-w-6xl space-y-6 px-5 py-8">
      {subscription?.expired && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900">
        {language === 'ar' ? 'اشتراك المنشأة معلّق. يمكنك الاطلاع على بياناتك الحالية فقط.' : 'The company subscription is suspended. Existing information remains read-only.'}
        {subscription.deletionScheduledAt && <span> {language === 'ar' ? 'تاريخ الحذف المجدول:' : 'Scheduled deletion:'} <span dir="ltr">{new Date(subscription.deletionScheduledAt).toLocaleDateString('en-GB')}</span></span>}
      </div>}

      <section className="overflow-hidden rounded-3xl bg-gradient-to-l from-emerald-700 to-slate-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div><p className="text-sm text-emerald-200">{language === 'ar' ? 'مرحبًا بك' : 'Welcome'}</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">{name}</h1><p className="mt-2 text-sm text-slate-300">{profile.jobTitle || '—'} · {profile.department || '—'}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4 backdrop-blur"><div className="text-xs text-slate-300">{language === 'ar' ? 'الرقم الوظيفي' : 'Employee No.'}</div><div className="mt-1 font-mono text-xl font-black" dir="ltr">{profile.employeeNo}</div></div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {cards.map(({ icon:Icon,...card }) => <article key={card.titleEn} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></div>
          <h2 className="mt-4 font-black">{language === 'ar' ? card.titleAr : card.titleEn}</h2><p className="mt-2 text-xs leading-6 text-slate-500">{language === 'ar' ? card.textAr : card.textEn}</p>
          <span className="mt-4 inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">{language === 'ar' ? 'قيد الإضافة في المرحلة التالية' : 'Coming in the next phase'}</span>
        </article>)}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><UserRound className="h-5 w-5 text-emerald-700" /><h2 className="font-black">{language === 'ar' ? 'بياناتي الوظيفية' : 'My employment profile'}</h2></div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-slate-500">{language === 'ar' ? 'القسم' : 'Department'}</dt><dd className="mt-1 font-bold">{profile.department || '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">{language === 'ar' ? 'المسمى الوظيفي' : 'Job title'}</dt><dd className="mt-1 font-bold">{profile.jobTitle || '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">{language === 'ar' ? 'تاريخ التعيين' : 'Hire date'}</dt><dd className="mt-1 font-bold" dir="ltr">{profile.hireDate || '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">{language === 'ar' ? 'الحالة' : 'Status'}</dt><dd className="mt-1 font-bold text-emerald-700">{profile.status}</dd></div>
        </dl>
      </section>
    </main>
  </div>;
};
