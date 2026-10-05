import React, { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, Building2, Check, FileCheck2, Fingerprint, Globe2, LockKeyhole, ShieldCheck, Users } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { WafrBrand } from './WafrBrand';

const publicPages = ['/','/pricing','/privacy','/terms'];
const go = (path:string) => { window.location.assign(path); };

const CookieNotice = ({ ar }:{ ar:boolean }) => {
  const [visible,setVisible] = useState(() => !localStorage.getItem('wafr_privacy_preferences_v1'));
  if (!visible) return null;
  const save = () => {
    localStorage.setItem('wafr_privacy_preferences_v1',JSON.stringify({ essential:true,analytics:false,savedAt:new Date().toISOString() }));
    setVisible(false);
  };
  return <aside className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl" role="dialog" aria-label={ar ? 'إعدادات الخصوصية' : 'Privacy preferences'}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm leading-7 text-slate-600">{ar ? 'نستخدم ملفات الارتباط الضرورية فقط لتسجيل الدخول وحماية الجلسة. لا نستخدم ملفات تسويقية أو إعلانية.' : 'We use only essential cookies for sign-in and session security. We do not use advertising or marketing cookies.'} <a href="/privacy" className="font-bold text-emerald-700">{ar ? 'سياسة الخصوصية' : 'Privacy policy'}</a></p>
      <button type="button" onClick={save} className="shrink-0 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white">{ar ? 'موافق على الضروري' : 'Accept essentials'}</button>
    </div>
  </aside>;
};

const LegalPage = ({ kind,ar }:{ kind:'privacy'|'terms';ar:boolean }) => {
  const privacy = kind === 'privacy';
  const sections = privacy ? (ar ? [
    ['البيانات التي نعالجها','بيانات المنشأة والمستخدمين والموظفين والرواتب والحضور والإجازات والبيانات البنكية التي تدخلها المنشأة، إضافة إلى سجلات الأمان والتشغيل اللازمة لحماية الخدمة.'],
    ['غرض المعالجة','تشغيل نظام الرواتب، تنفيذ الصلاحيات، إنشاء التقارير، حماية الحسابات، دعم المستخدمين، والوفاء بالالتزامات النظامية التي تقع على المنشأة المستخدمة.'],
    ['المشاركة والحفظ','لا نبيع البيانات. قد تُعالج البيانات بواسطة مزودي الاستضافة والبريد والتكاملات التي تفعلها المنشأة. تحفظ البيانات طوال الاشتراك وفترة الاحتفاظ المعلنة، ثم تحذف أو تُجهّل وفق الإجراءات التشغيلية.'],
    ['حقوق أصحاب البيانات','يمكن طلب الوصول أو التصحيح أو الحذف أو تقييد المعالجة من خلال مسؤول المنشأة. بعض البيانات قد يلزم الاحتفاظ بها لأغراض محاسبية أو نظامية أو أمنية.'],
    ['الأمان','نستخدم تشفير الاتصال، كلمات مرور مجزأة، صلاحيات حسب الدور، عزل بيانات المنشآت، سجلات تدقيق، نسخًا احتياطية، وضوابط للجلسات والطلبات. لا توجد وسيلة إلكترونية تضمن منع المخاطر بنسبة 100%.'],
    ['التواصل والتحديثات','للاستفسارات أو طلبات الخصوصية تواصل مع إدارة وفر للرواتب. سنعلن عن أي تحديث جوهري للسياسة داخل الخدمة قبل سريانه متى كان ذلك مطلوبًا.'],
  ] : [
    ['Data we process','Company, user, employee, payroll, attendance, leave and bank information entered by the subscribing company, plus security and operational logs required to protect the service.'],
    ['Purpose','Operating payroll, enforcing permissions, producing reports, protecting accounts, supporting users, and helping the subscriber meet its legal obligations.'],
    ['Sharing and retention','We do not sell data. Hosting, email and subscriber-enabled integration providers may process limited data. Data is retained during subscription and the announced retention period, then deleted or anonymized.'],
    ['Data-subject rights','Access, correction, deletion or restriction requests may be submitted through the subscriber administrator. Some records may be retained for accounting, legal or security purposes.'],
    ['Security','Controls include encrypted transport, hashed passwords, role-based access, tenant isolation, audit logs, backups, and session/request safeguards. No electronic method eliminates all risk.'],
    ['Contact and changes','Contact WAFR Payroll administration for privacy requests. Material policy updates will be announced in the service before taking effect when required.'],
  ]) : (ar ? [
    ['نطاق الخدمة','وفر للرواتب خدمة لإدارة بيانات الموظفين والمسيرات والحضور والإجازات والتقارير. تظل المنشأة مسؤولة عن صحة البيانات واعتماد النتائج والالتزام بالأنظمة السارية.'],
    ['الحسابات والصلاحيات','يجب حماية بيانات الدخول وتحديد الصلاحيات على أساس الحاجة. المستخدم الرئيسي للمنشأة مسؤول عن المستخدمين والتكاملات والإعدادات التابعة لها.'],
    ['الاستخدام المقبول','يحظر إساءة استخدام الخدمة أو محاولة تجاوز الصلاحيات أو اختبار الأمان دون تصريح أو إدخال بيانات لا تملك المنشأة حق معالجتها.'],
    ['الاشتراك والتوفر','تحدد مدة التجربة والاشتراك في العرض أو الاتفاق. قد تتوقف بعض الوظائف للصيانة أو عند انتهاء الاشتراك مع إتاحة التصدير وفق سياسة الاحتفاظ المطبقة.'],
    ['المسؤولية','النظام أداة مساعدة ولا يغني عن المراجعة المهنية. يجب مراجعة المسيرات والقيود والتحويلات قبل اعتمادها أو إرسالها.'],
  ] : [
    ['Service scope','WAFR Payroll manages employee, payroll, attendance, leave and reporting data. The subscriber remains responsible for data accuracy, approvals and compliance with applicable laws.'],
    ['Accounts and permissions','Credentials must be protected and access limited by need. The company owner account is responsible for its users, integrations and settings.'],
    ['Acceptable use','Misuse, unauthorized security testing, permission bypass attempts, or processing data without a lawful right are prohibited.'],
    ['Subscription and availability','Trial and subscription terms are defined in the applicable offer. Features may be unavailable during maintenance or after expiry, subject to the applicable retention/export policy.'],
    ['Responsibility','The service is an operational aid, not a substitute for professional review. Payroll, journal and payment outputs must be reviewed before approval or submission.'],
  ]);
  return <main className="wafr-public-site min-h-screen bg-slate-50 text-slate-900" dir={ar ? 'rtl' : 'ltr'}>
    <PublicHeader ar={ar} />
    <article className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
      <p className="text-sm font-bold text-emerald-700">{ar ? 'الإصدار 1.0 — 28 سبتمبر 2026' : 'Version 1.0 — 28 September 2026'}</p>
      <h1 className="mt-3 text-4xl font-black">{privacy ? (ar ? 'سياسة الخصوصية' : 'Privacy Policy') : (ar ? 'شروط الاستخدام' : 'Terms of Use')}</h1>
      <p className="mt-5 text-base leading-8 text-slate-600">{privacy ? (ar ? 'توضح هذه السياسة كيفية تعامل وفر للرواتب مع البيانات عند استخدام الموقع أو النظام.' : 'This policy explains how WAFR Payroll handles data when you use the website or service.') : (ar ? 'باستخدام وفر للرواتب أو إنشاء حساب، فإنك توافق على هذه الشروط وسياسة الخصوصية.' : 'By using WAFR Payroll or creating an account, you agree to these terms and the Privacy Policy.')}</p>
      <div className="mt-10 space-y-5">{sections.map(([title,body]) => <section key={title} className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-black">{title}</h2><p className="mt-3 leading-8 text-slate-600">{body}</p></section>)}</div>
    </article>
    <PublicFooter ar={ar} />
  </main>;
};

const PublicHeader = ({ ar }:{ ar:boolean }) => {
  const { toggleLanguage } = useLanguage();
  return <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl" dir={ar ? 'rtl' : 'ltr'}>
    <div className="mx-auto flex h-18 max-w-7xl items-center gap-2 px-3 sm:gap-4 sm:px-8">
      <button type="button" onClick={() => go('/')} className="me-auto flex-none" aria-label={ar ? 'العودة إلى الرئيسية' : 'Back to home'}><WafrBrand compact inverse={false} showTagline={false} className="gap-2 sm:gap-3" /></button>
      <nav className="hidden items-center gap-7 text-sm font-bold text-slate-600 md:flex"><a href="/#features">{ar ? 'المزايا' : 'Features'}</a><a href="/pricing">{ar ? 'الباقات' : 'Pricing'}</a><a href="/privacy">{ar ? 'الخصوصية' : 'Privacy'}</a></nav>
      <button type="button" onClick={toggleLanguage} className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50" aria-label={ar ? 'Switch to English' : 'التبديل إلى العربية'}>
        <Globe2 className="h-4 w-4" /><span>{ar ? 'EN' : 'AR'}</span>
      </button>
      <a href="/login" className="shrink-0 whitespace-nowrap rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-black text-white sm:px-5 sm:text-sm">{ar ? 'دخول النظام' : 'Sign in'}</a>
    </div>
  </header>;
};

const PublicFooter = ({ ar }:{ ar:boolean }) => <footer className="border-t border-slate-200 bg-white" dir={ar ? 'rtl' : 'ltr'}><div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8"><p>© 2026 {ar ? 'وفر للرواتب. جميع الحقوق محفوظة.' : 'WAFR Payroll. All rights reserved.'}</p><div className="flex gap-5"><a href="/privacy">{ar ? 'الخصوصية' : 'Privacy'}</a><a href="/terms">{ar ? 'الشروط' : 'Terms'}</a></div></div></footer>;

export const PublicWebsite:React.FC = () => {
  const { language,toggleLanguage } = useLanguage();
  const ar = language === 'ar';
  const path = publicPages.includes(window.location.pathname) ? window.location.pathname : '/';
  useEffect(() => {
    const titles:Record<string,string> = {'/':ar ? 'وفر للرواتب | إدارة الرواتب والموظفين' : 'WAFR Payroll | Payroll & People Management','/pricing':ar ? 'باقات وفر للرواتب' : 'WAFR Payroll Pricing','/privacy':ar ? 'سياسة الخصوصية | وفر' : 'Privacy Policy | WAFR','/terms':ar ? 'شروط الاستخدام | وفر' : 'Terms of Use | WAFR'};
    document.title=titles[path];
    document.documentElement.lang=ar ? 'ar' : 'en'; document.documentElement.dir=ar ? 'rtl' : 'ltr';
  },[ar,path]);
  if (path === '/privacy' || path === '/terms') return <><LegalPage kind={path === '/privacy' ? 'privacy' : 'terms'} ar={ar} /><CookieNotice ar={ar} /></>;
  if (path === '/pricing') return <main className="wafr-public-site min-h-screen bg-slate-50" dir={ar ? 'rtl' : 'ltr'}><PublicHeader ar={ar}/><section className="mx-auto max-w-6xl px-5 py-20 text-center sm:px-8"><span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-800">{ar ? 'حل مرن حسب حجم منشأتك' : 'Flexible for your organization'}</span><h1 className="mt-6 text-4xl font-black sm:text-5xl">{ar ? 'باقات مصممة حسب احتياجك' : 'Plans tailored to your needs'}</h1><p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">{ar ? 'نحدد العرض وفق عدد الموظفين والمنشآت والتكاملات المطلوبة، بدون دفع مقابل وظائف لا تحتاجها.' : 'Pricing is based on employee count, entities and required integrations—without paying for features you do not need.'}</p><div className="mx-auto mt-12 max-w-3xl rounded-3xl border border-emerald-200 bg-white p-8 text-start shadow-xl"><h2 className="text-2xl font-black">{ar ? 'اطلب عرض سعر' : 'Request a quote'}</h2><div className="mt-6 grid gap-3 sm:grid-cols-2">{[ar?'إدارة الموظفين والمسيرات':'Employees and payroll',ar?'الحضور والإجازات':'Attendance and leave',ar?'التأمينات والقيود المحاسبية':'GOSI and accounting journals',ar?'بوابة الموظف والصلاحيات':'Employee portal and permissions',ar?'نسخ احتياطي وسجل تدقيق':'Backups and audit log',ar?'دعم الإعداد ونقل البيانات':'Setup and data migration support'].map(x=><p key={x} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 font-bold"><Check className="h-4 w-4 text-emerald-600"/>{x}</p>)}</div><a href="/login" className="mt-8 flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-4 font-black text-slate-950">{ar ? 'ابدأ التجربة واطلب العرض' : 'Start trial and request quote'}<ArrowLeft className="h-5 w-5"/></a></div></section><PublicFooter ar={ar}/><CookieNotice ar={ar}/></main>;
  const features = [[Users,ar?'ملفات الموظفين':'Employee records',ar?'بيانات موحدة وأرشفة وحالات وظيفية وصلاحيات دقيقة.':'Unified records, archiving, lifecycle states and precise access.'],[BarChart3,ar?'مسير رواتب متكامل':'Complete payroll',ar?'احتساب ومراجعة واعتماد ودفع مع تتبع كامل لكل فترة.':'Calculate, review, approve and pay with period-level traceability.'],[FileCheck2,ar?'إجازات وحضور':'Leave and attendance',ar?'سياسات مهنية ومنزلية وأرصدة واستحقاق من تاريخ المباشرة.':'Professional and domestic policies with anniversary-based accrual.'],[Building2,ar?'محاسبة وتأمينات':'Accounting and GOSI',ar?'قيود محاسبية ومطابقة التأمينات وتكاملات قابلة للمراجعة.':'Auditable journals, GOSI reconciliation and integrations.'],[Fingerprint,ar?'بوابة الموظف':'Employee portal',ar?'طلبات ورواتب وخصومات وبيانات بنكية في مساحة آمنة.':'Requests, payslips, deductions and bank details in a secure space.'],[ShieldCheck,ar?'خصوصية وأمان':'Privacy and security',ar?'عزل المنشآت وصلاحيات وسجل تدقيق ونسخ احتياطية.':'Tenant isolation, permissions, audit trails and backups.']];
  return <main className="wafr-public-site min-h-screen bg-white text-slate-950" dir={ar ? 'rtl' : 'ltr'}><PublicHeader ar={ar}/><section className="relative overflow-hidden bg-slate-950 px-5 py-24 text-white sm:px-8"><div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,.2),transparent_35%),radial-gradient(circle_at_80%_70%,rgba(6,182,212,.15),transparent_35%)]"/><div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2"><div><span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200"><LockKeyhole className="h-4 w-4"/>{ar?'إدارة رواتب آمنة وواضحة':'Secure, clear payroll operations'}</span><h1 className="mt-7 text-5xl font-black leading-[1.15] sm:text-6xl">{ar?'رواتب أدق، إدارة أوفر':'Smarter payroll, better savings'} <span className="text-emerald-400">{ar?'مع وفر':'with WAFR'}</span></h1><p className="mt-6 max-w-xl text-lg leading-9 text-slate-300">{ar?'منصة سعودية لإدارة الموظفين والرواتب والحضور والإجازات والتأمينات والقيود المحاسبية من مكان واحد.':'A Saudi-focused platform for employees, payroll, attendance, leave, GOSI and accounting journals in one place.'}</p><div className="mt-9 flex flex-wrap gap-3"><a href="/login" className="rounded-2xl bg-emerald-500 px-7 py-4 font-black text-slate-950">{ar?'ابدأ تجربتك':'Start your trial'}</a><a href="/pricing" className="rounded-2xl border border-white/15 px-7 py-4 font-black">{ar?'اطلب عرض سعر':'Request a quote'}</a></div></div><div className="grid grid-cols-2 gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">{[['300+',ar?'موظف قابل للإدارة':'employees ready'],['30/21',ar?'سياسات إجازة مرنة':'flexible leave rules'],['24/7',ar?'وصول آمن':'secure access'],['100%',ar?'سجل عمليات قابل للمراجعة':'auditable operations']].map(([n,l])=><div key={l} className="rounded-2xl border border-white/10 bg-slate-900/70 p-5"><div className="text-3xl font-black text-emerald-400">{n}</div><div className="mt-2 text-sm text-slate-400">{l}</div></div>)}</div></div></section><section id="features" className="mx-auto max-w-7xl px-5 py-20 sm:px-8"><div className="max-w-3xl"><p className="font-black text-emerald-700">{ar?'كل دورة الرواتب في نظام واحد':'The entire payroll cycle'}</p><h2 className="mt-3 text-4xl font-black">{ar?'أدوات عملية مبنية للعمل اليومي':'Practical tools built for daily operations'}</h2></div><div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{features.map(([Icon,title,body]:any)=><article key={title} className="rounded-3xl border border-slate-200 p-6 transition hover:-translate-y-1 hover:shadow-xl"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><Icon className="h-6 w-6"/></span><h3 className="mt-5 text-xl font-black">{title}</h3><p className="mt-3 leading-7 text-slate-600">{body}</p></article>)}</div></section><section className="bg-slate-50 px-5 py-20 sm:px-8"><div className="mx-auto flex max-w-5xl flex-col items-center text-center"><Globe2 className="h-12 w-12 text-emerald-600"/><h2 className="mt-5 text-4xl font-black">{ar?'جاهز لمنشأتك بدون تعقيد':'Ready for your organization'}</h2><p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">{ar?'ابدأ التجربة، أضف موظفيك، ثم اطلب عرضًا يناسب عدد الموظفين والتكاملات التي تحتاجها.':'Start a trial, add your employees, then request a quote based on your team size and required integrations.'}</p><a href="/login" className="mt-8 rounded-2xl bg-slate-950 px-8 py-4 font-black text-white">{ar?'الدخول أو إنشاء منشأة':'Sign in or create a company'}</a><button type="button" onClick={toggleLanguage} className="mt-5 text-sm font-bold text-slate-500">{ar?'English':'العربية'}</button></div></section><PublicFooter ar={ar}/><CookieNotice ar={ar}/></main>;
};
