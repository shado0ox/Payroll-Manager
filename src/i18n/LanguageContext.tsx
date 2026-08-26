import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
export type AppLanguage = 'ar' | 'en';
const translations = {
  payrollSystem: { ar: 'نظام مسار للرواتب', en: 'Masar Payroll System' }, payrollSummary: { ar: 'ملخص الرواتب - مسار', en: 'Payroll Summary - Masar' },
  wageCompliance: { ar: 'إدارة الأجور والامتثال', en: 'Payroll & Compliance Management' }, dashboard: { ar: 'لوحة التحكم', en: 'Dashboard' },
  companyProfile: { ar: 'ملف المنشأة', en: 'Company Profile' }, payrollRuns: { ar: 'مسيرات الرواتب', en: 'Payroll Runs' }, employees: { ar: 'الموظفون', en: 'Employees' },
  attendance: { ar: 'الحضور والإجازات', en: 'Attendance & Leave' }, loans: { ar: 'السلف والخصومات', en: 'Loans & Deductions' }, journals: { ar: 'القيود وتكامل قيود', en: 'Journals & Qoyod' },
  reports: { ar: 'التقارير والإحصائيات', en: 'Reports & Analytics' }, users: { ar: 'المستخدمون والصلاحيات', en: 'Users & Permissions' }, settings: { ar: 'إدارة الشركات والمنشآت', en: 'Companies & Settings' },
  audit: { ar: 'سجل التدقيق والأمان', en: 'Audit & Security Log' }, logout: { ar: 'تسجيل الخروج', en: 'Sign out' }, newPayroll: { ar: 'تشغيل مسير جديد', en: 'New Payroll Run' },
  companyCode: { ar: 'كود', en: 'Code' }, dbConnected: { ar: 'قاعدة البيانات: متصلة', en: 'Database: Connected' }, dbDisconnected: { ar: 'قاعدة البيانات: غير متصلة', en: 'Database: Disconnected' },
  language: { ar: 'English', en: 'العربية' },
  loginTitle: { ar: 'تسجيل الدخول للنظام', en: 'Sign in to the system' }, loginHint: { ar: 'أدخل رمز المنشأة وبيانات الاعتماد', en: 'Enter the company code and your credentials' },
  username: { ar: 'اسم المستخدم', en: 'Username' }, password: { ar: 'كلمة المرور', en: 'Password' }, signIn: { ar: 'تسجيل الدخول للمنشأة', en: 'Sign in' },
  invalidLogin: { ar: 'رمز المنشأة أو اسم المستخدم أو كلمة المرور غير صحيحة.', en: 'Invalid company code, username, or password.' },
  loginSubtitle: { ar: 'منظومة إدارة مسيرات الأجور والامتثال المالي', en: 'Payroll processing and financial compliance platform' },
  companyCodeLabel: { ar: 'رمز المنشأة / الشركة', en: 'Company code' },
  companyCodePlaceholder: { ar: 'أدخل رمز المنشأة (مثال: 101)', en: 'Enter company code (example: 101)' },
  designedBy: { ar: 'تم التصميم والتطوير بواسطة الأستاذ:', en: 'Designed and developed by:' },
  loginFooter: { ar: 'نظام مسار لإدارة الرواتب والأجور المتوافق مع نظام العمل السعودي ومنصة مدد', en: 'Masar payroll management system aligned with Saudi labor requirements and Mudad' },
  primarySystemAdmin: { ar: 'مسؤول النظام الرئيسي', en: 'Primary system administrator' },
  systemAdmin: { ar: 'مسؤول النظام', en: 'System administrator' },
  generalManager: { ar: 'المدير العام', en: 'General manager' },
  operationsManager: { ar: 'مدير العمليات', en: 'Operations manager' },
  systemUser: { ar: 'مستخدم النظام', en: 'System user' },
  user: { ar: 'المستخدم', en: 'User' },
  logoutTitle: { ar: 'تسجيل الخروج من النظام', en: 'Sign out of the system' },
  databaseStatusTitle: { ar: 'فحص حالة قاعدة البيانات والنسخ الاحتياطي', en: 'Check database status and backup' },
  databaseChecking: { ar: 'قاعدة البيانات: جاري الفحص', en: 'Database: Checking' },
  databaseStatus: { ar: 'حالة قاعدة البيانات', en: 'Database status' },
  resetData: { ar: 'إعادة ضبط البيانات', en: 'Reset data' },
  checkingSession: { ar: 'جاري التحقق من الجلسة...', en: 'Checking your session...' },
  databaseNotice: { ar: 'إشعار قاعدة البيانات:', en: 'Database notice:' },
  databaseUnavailable: { ar: 'تعذر الوصول إلى PostgreSQL — لن تُحفظ التعديلات الجديدة حتى عودة الاتصال. البيانات الموجودة على الخادم لم تُحذف.', en: 'PostgreSQL is unreachable. New changes will not be saved until the connection returns. Existing server data has not been deleted.' },
  checkConnectionBackup: { ar: 'فحص الاتصال والنسخ الاحتياطي', en: 'Check connection & backup' },
  hideNotice: { ar: 'إخفاء التنبيه', en: 'Dismiss notice' },
} as const;
type TranslationKey = keyof typeof translations;
type ContextValue = { language: AppLanguage; toggleLanguage: () => void; t: (key: TranslationKey) => string };
const LanguageContext = createContext<ContextValue | null>(null);

export const LanguageProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [language, setLanguage] = useState<AppLanguage>(() => localStorage.getItem('masar_language') === 'en' ? 'en' : 'ar');
  useEffect(() => { localStorage.setItem('masar_language', language); document.documentElement.lang = language; document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'; }, [language]);
  const value = useMemo<ContextValue>(() => ({ language, toggleLanguage: () => setLanguage(v => v === 'ar' ? 'en' : 'ar'), t: key => translations[key][language] }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
export const useLanguage = () => { const value = useContext(LanguageContext); if (!value) throw new Error('LanguageProvider is missing'); return value; };
