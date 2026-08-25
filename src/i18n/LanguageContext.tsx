import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { generatedTranslations } from './generatedTranslations';
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
} as const;
type TranslationKey = keyof typeof translations;
type ContextValue = { language: AppLanguage; toggleLanguage: () => void; t: (key: TranslationKey) => string };
const LanguageContext = createContext<ContextValue | null>(null);

const qualityOverrides: Record<string, string> = {
  'حفظ': 'Save', 'إلغاء': 'Cancel', 'حذف': 'Delete', 'تعديل': 'Edit', 'إضافة': 'Add', 'بحث': 'Search',
  'تصدير': 'Export', 'طباعة': 'Print', 'إغلاق': 'Close', 'تأكيد': 'Confirm', 'رجوع': 'Back', 'التالي': 'Next',
  'نشط': 'Active', 'غير نشط': 'Inactive', 'معطل': 'Disabled', 'مسودة': 'Draft', 'تحت المراجعة': 'Under review',
  'معتمد': 'Approved', 'مرحل': 'Posted', 'مكتمل': 'Completed', 'معلق': 'Paused', 'مرفوض': 'Rejected',
  'سعودي': 'Saudi', 'غير سعودي': 'Non-Saudi', 'حاضر': 'Present', 'غائب': 'Absent', 'إجازة': 'Leave',
  'الموظف': 'Employee', 'الموظفين': 'Employees', 'القسم': 'Department', 'المسمى الوظيفي': 'Job title',
  'الراتب الأساسي': 'Basic salary', 'بدل السكن': 'Housing allowance', 'بدل النقل': 'Transport allowance',
  'إجمالي الراتب': 'Gross salary', 'صافي الراتب': 'Net salary', 'إجمالي الاستحقاقات': 'Total earnings',
  'إجمالي الاستقطاعات': 'Total deductions', 'السلف': 'Employee loans', 'الجزاءات': 'Penalties',
  'التأمينات الاجتماعية': 'GOSI', 'رقم الهوية / الإقامة': 'National ID / Iqama number', 'رقم الإقامة': 'Iqama number',
  'مركز التكلفة': 'Cost center', 'قيد محاسبي': 'Journal entry', 'القيود المحاسبية': 'Accounting journal entries',
  'مسير الرواتب': 'Payroll run', 'مسيرات الرواتب': 'Payroll runs', 'حماية الأجور': 'Wage Protection System',
  'الحضور والانصراف': 'Attendance & time tracking', 'الحضور والإجازات': 'Attendance & leave',
  'الرقم الوظيفي': 'Employee number', 'تاريخ التعيين': 'Hire date', 'تاريخ الاستحقاق': 'Accrual date',
  'اسم المنشأة': 'Company name', 'رمز المنشأة': 'Company code', 'السجل التجاري': 'Commercial registration',
  'الرقم الضريبي': 'VAT number', 'العملة': 'Currency', 'الإعدادات': 'Settings', 'الصلاحيات': 'Permissions',
  'استيراد موظفين': 'Import employees', 'جاري قراءة الملف...': 'Reading file...',
  'معاينة استيراد الموظفين': 'Employee import preview', 'مطابقة أعمدة الشيت': 'Map spreadsheet columns',
  'تجاهل العمود': 'Ignore column', 'اسم الموظف': 'Employee name', 'الدولة / الجنسية': 'Country / nationality',
  'اسم البنك': 'Bank name', 'إضافات ثابتة': 'Fixed additions', 'استقطاعات ثابتة': 'Fixed deductions',
  'ملاحظات': 'Notes', 'صف صالح للاستيراد': 'valid row(s) to import',
  'صف مكرر سيتم تجاهله': 'duplicate row(s) will be skipped', 'صف به أخطاء': 'row(s) with errors',
  'راجع المطابقة التلقائية. في نموذجك يتم اقتراح cards كاسم البنك وCASH كرمز SWIFT.': 'Review the automatic mapping. For your template, cards is suggested as bank name and CASH as SWIFT code.',
  'أول الأخطاء:': 'First errors:', 'صف العناوين': 'Header row', 'بيانات إلزامية ناقصة': 'Required data is missing',
  'رقم IBAN غير صالح': 'Invalid IBAN', 'تعذر قراءة الملف': 'Could not read the file',
  'حجم الملف يتجاوز 5 ميجابايت': 'File size exceeds 5 MB',
  'النوع غير مدعوم. استخدم XLSX أو CSV أو TSV': 'Unsupported type. Use XLSX, CSV, or TSV',
  'الملف يتجاوز الحد الأقصى وهو 2500 صف': 'The file exceeds the 2,500-row limit',
  'تعذر اكتشاف صف العناوين. تأكد من وجود الرقم الوظيفي والاسم والإقامة': 'Could not detect the header row. Make sure employee number, name, and Iqama columns exist',
  'ابحث بالاسم أو الرقم الوظيفي أو الإقامة...': 'Search by name, employee number, or Iqama...',
  'اختر موظفًا': 'Select an employee', 'بدون اختيار': 'No selection',
  'بدون ربط (حساب إداري مستقل)': 'No link (independent admin account)',
  'لا يوجد موظف مطابق للبحث': 'No employee matches your search',
  'رقم مكرر تم تصحيحه': 'duplicate number(s) corrected',
  'موظف يحتاج استكمال بيانات': 'employee(s) need data completion',
  'صف غير موظف تم تجاهله': 'non-employee row(s) ignored',
  'بيانات تحتاج استكمال': 'Data needs completion', 'غير مكتملة': 'Incomplete',
  'IBAN غير مكتمل': 'IBAN incomplete', 'بيانات بنكية غير مكتملة': 'Incomplete bank details',
  'رقم الإقامة غير مكتمل': 'Iqama number incomplete', 'بيانات IBAN غير مكتملة': 'IBAN details incomplete',
  'رقم IBAN يحتاج مراجعة': 'IBAN needs review', 'الرقم الوظيفي غير محدد': 'Employee number is missing',
  'إدارة البيانات الحساسة': 'Sensitive data management', 'منطقة الخطر وإدارة البيانات الحساسة': 'Danger zone and sensitive data management',
  'مسح جميع موظفي المنشأة': 'Delete all company employees', 'مسح جميع الموظفين': 'Delete all employees',
  'تأكيد مسح جميع الموظفين': 'Confirm deleting all employees', 'حذف جميع الموظفين': 'DELETE ALL EMPLOYEES',
  'حذف نهائي': 'Delete permanently', 'هذه العملية لا يمكن التراجع عنها من داخل النظام': 'This action cannot be undone from within the system',
  'اكتب «حذف جميع الموظفين» للتأكيد:': 'Type “DELETE ALL EMPLOYEES” to confirm:',
  'العمليات في هذا القسم نهائية وتؤثر على بيانات المنشأة الحالية فقط.': 'Actions in this section are permanent and affect the current company only.',
  'دفعات تحويل الرواتب': 'Salary transfer batches', 'تم تحويله': 'Transferred',
  'مجدول للتحويل': 'Scheduled for transfer', 'غير محوّل': 'Not transferred',
  'متاح لدفعة جديدة': 'Available for a new batch', 'تحديد المتاح': 'Select available',
  'إنشاء دفعة للمحددين': 'Create batch for selected', 'إنشاء دفعة تحويل رواتب': 'Create salary transfer batch',
  'حوّل لمجموعة أو لموظف واحد مع إبقاء مسير الشهر موحدًا.': 'Transfer to a group or one employee while keeping a single monthly payroll run.',
  'رقم الدفعة': 'Batch number', 'المبلغ': 'Amount', 'الطريقة والتاريخ': 'Method and date',
  'حماية الأجور WPS': 'WPS', 'تحويل بنكي': 'Bank transfer', 'دفع نقدي': 'Cash payment',
  'تم التحويل': 'Transferred', 'فشل التحويل': 'Transfer failed', 'ملغاة': 'Cancelled',
  'الموظفون متاحون لدفعة جديدة': 'Employees are available for a new batch',
  'يجب اعتماد المسير أولًا قبل إنشاء دفعات التحويل.': 'The payroll run must be approved before creating transfer batches.',
  'بانتظار إدراجه في دفعة': 'Waiting to be added to a batch', 'تحديد لدفعة تحويل': 'Select for transfer batch',
  'طريقة التحويل': 'Transfer method', 'تاريخ التحويل المجدول': 'Scheduled transfer date',
  'مرجع التحويل': 'Transfer reference', 'رقم ملف البنك أو الحوالة': 'Bank file or transfer reference',
  'إجمالي الدفعة': 'Batch total', 'إنشاء وجدولة الدفعة': 'Create and schedule batch',
  'قيد السداد': 'Payment journal', 'مجدولة للتحويل': 'Scheduled for transfer',
  'طريقة تحمل اشتراك GOSI': 'GOSI contribution payment method',
  'عادي: حصة على الموظف وحصة على الشركة': 'Standard: employee and company shares',
  'الشركة تتحمل الاشتراك كاملًا دون خصم الموظف': 'Company pays the full contribution with no employee deduction',
  'بدلات أخرى غير خاضعة لـ GOSI': 'Other allowances not subject to GOSI',
  'التراجع عن الترحيل': 'Reverse posting', 'ملف البنك Excel': 'Bank Excel file',
  'تعديل إضافة أو خصم': 'Edit addition or deduction',
  'تعديل إضافات وخصومات المسير': 'Edit payroll additions and deductions',
  'إضافة على الراتب': 'Payroll addition', 'خصم إضافي': 'Additional deduction',
  'سبب التعديل / المرجع': 'Adjustment reason / reference',
  'حفظ وإعادة الاحتساب': 'Save and recalculate',
  'اسم العميل / كود العميل لدى البنك': 'Bank customer name / code',
  'رمز اتفاقية الرواتب': 'Payroll agreement code', 'حساب التمويل': 'Funding account',
  'رقم فرع البنك': 'Bank branch number', 'رقم المنشأة في مكتب العمل': 'Labor Office establishment number',
  'رقم المنشأة في الغرفة التجارية': 'Chamber of Commerce establishment number',
  'رمز البنك المختصر في ملف الرواتب': 'Payroll file bank code',
  'تعريفات البنوك وSWIFT للموظفين': 'Employee bank and SWIFT definitions',
  'يُحدد البنك تلقائيًا من الرقمين الخامس والسادس في IBAN ويُطبّق SWIFT هنا على كل موظفي البنك.': 'The bank is detected from the IBAN bank code and this SWIFT is applied to every employee at that bank.',
  'إضافة بنك': 'Add bank', 'كود IBAN': 'IBAN bank code', 'اسم البنك بالعربي': 'Arabic bank name',
  'الاسم بالإنجليزي': 'English name', 'إجراء': 'Action',
  'إلغاء الغياب': 'Cancel absence', 'إلغاء غياب مسجل': 'Cancel recorded absence',
  'حذف الحركة وإلغاء أثرها من المسير': 'Delete the record and remove its payroll impact',
  'الحضور والانصراف والإجازات': 'Attendance, time tracking & leave',
  'تسجيل التأخير، الغياب، العمل الإضافي، والإجازات بدون راتب لتطبيقها آلياً في مسير الرواتب': 'Record lateness, absence, overtime, and unpaid leave for automatic payroll processing',
  'تسجيل حركة حضور / غياب': 'Record attendance / absence',
  'سجل الحضور والحركات': 'Attendance records', 'طلبات الإجازات': 'Leave requests',
  'تسجيل حركة حضور / تأخير / إضافي': 'Record attendance / lateness / overtime',
  'تاريخ الغياب / الحركة (من وإلى)': 'Absence / transaction dates (from–to)',
  'من تاريخ (البداية)': 'From date', 'إلى تاريخ (النهاية)': 'To date', 'يوم واحد': 'One day',
  'دقائق التأخير': 'Lateness minutes', 'ساعات العمل الإضافي': 'Overtime hours',
  'غياب غير مبرر (خصم يوم كامل)': 'Unexcused absence (full-day deduction)', 'إجازة بدون راتب': 'Unpaid leave',
  'سبب التأخير أو العمل الإضافي...': 'Reason for lateness or overtime...', 'حفظ الحركة': 'Save record',
  'السلف والأقساط والجزاءات الإدارية': 'Employee loans, installments & administrative deductions',
  'جدولة أقساط سلف الموظفين، ضبط حد الاستقطاع (33%)، وتسجيل الخصومات الإدارية': 'Schedule employee loan installments, control the 33% deduction limit, and record administrative deductions',
  'إضافة سلفة جديدة': 'Add new loan', 'تسجيل جزاء / خصم إداري': 'Record penalty / administrative deduction',
  'إجمالي أرصدة السلف القائمة': 'Total outstanding loan balances', 'استقطاع الأقساط الشهري المتوقع': 'Expected monthly installment deduction',
  'عدد الموظفين المستفيدين من السلف': 'Employees with active loans', 'ذمم مدينة لموظفي المنشأة': 'Employee receivables',
  'يُخصم شهرياً عبر مسير الرواتب': 'Deducted monthly through payroll', 'سلف سارية المفعول': 'Active loans',
  'سجل سلف الموظفين': 'Employee loan register', 'الجزاءات والخصومات': 'Penalties and deductions',
  'تعديل السلفة': 'Edit loan', 'حذف السلفة': 'Delete loan', 'ملغى': 'Cancelled', 'تعديل الخصم': 'Edit deduction',
  'التراجع عن الخصم': 'Reverse deduction', 'تعديل الحركة': 'Edit record', 'تعديل حركة الحضور': 'Edit attendance record',
  'التراجع وإعادة الطلب للمراجعة': 'Reverse and return request for review',
  'حذف السلفة نهائيًا وإزالة أقساطها من المسير القادم؟': 'Permanently delete this loan and remove its installments from the next payroll run?',
  'إلغاء هذا الخصم وإزالة أثره من المسير؟': 'Reverse this deduction and remove its payroll impact?',
  'حذف الجزاء/الخصم نهائيًا؟': 'Permanently delete this penalty/deduction?',
  'غياب فترة': 'Absence period', 'المدة:': 'Duration:', 'أيام غياب': 'absence days',
  'تخصيص ما يمكن للمستخدم استخدامه': 'Customize user access',
  'إضافة وحذف الشركات متاحة لمسؤول النظام الرئيسي فقط.': 'Adding and deleting companies is restricted to the primary system administrator.',
  'جاري التحقق من الجلسة...': 'Checking session...',
};
const translationCatalog: Record<string, string> = { ...generatedTranslations, ...qualityOverrides };
// Only the compact, reviewed glossary is used for partial/dynamic replacements.
// All 1,116 generated phrases still use O(1) exact lookup. Iterating the entire
// catalog for every DOM node made the first English render unnecessarily costly.
const dynamicTranslationKeys = Object.keys(qualityOverrides).sort((a, b) => b.length - a.length);
const originalTextNodes = new WeakMap<Text, string>();
const originalElementAttributes = new WeakMap<Element, Map<string, string>>();
function polishTranslation(source: string, value: string): string {
  let result = value.replaceAll('&apos;', "'");
  if (source.includes('مسير')) result = result.replace(/salary marches?|pay marches?|salary routes?|pay routes?|salary courses?|pay courses?|salary passes?/gi, match => match.toLowerCase().endsWith('s') ? 'payroll runs' : 'payroll run');
  if (source.includes('مُدد') || source.includes('مدد')) result = result.replace(/extended platform|extended/gi, 'Mudad');
  if (source.includes('آيبان') || source.includes('الآيبان')) result = result.replace(/iphone|ipan|iPan/gi, 'IBAN');
  if (source.includes('السويفت')) result = result.replace(/suft|soft|asteroid/gi, 'SWIFT');
  if (source.includes('منشأة') || source.includes('المنشأة')) result = result.replace(/plant|facility|enterprise|establishment/gi, 'company');
  if (source.includes('خصم') || source.includes('خصومات')) result = result.replace(/liabilit(y|ies)|discounts?/gi, match => match.toLowerCase().endsWith('ies') ? 'deductions' : 'deduction');
  if (source.includes('استحقاقات')) result = result.replace(/benefits/gi, 'earnings');
  if (/برنامج قيود|نظام قيود|خادم قيود|Qoyod|API/.test(source)) result = result.replace(/restricted programme|restraint system|constraint system|chain server|restriction server/gi, 'Qoyod');
  if (source.includes('قيود محاسبية') || source.includes('القيود المحاسبية')) result = result.replace(/accounting restrictions|accounting constraints/gi, 'accounting journal entries');
  return result;
}
export function translateUiText(value: string): string {
  if (!value) return value;
  value = value.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  if (!/[\u0600-\u06ff]/.test(value)) return value;
  const exact = translationCatalog[value.trim()];
  if (exact) return value.replace(value.trim(), polishTranslation(value.trim(), exact));
  let result = value;
  for (const key of dynamicTranslationKeys) {
    if (result.includes(key)) result = result.split(key).join(polishTranslation(key, translationCatalog[key]));
  }
  return result;
}

const DomLocalizer: React.FC<{ language: AppLanguage }> = ({ language }) => {
  useEffect(() => {
    const attributes = ['placeholder', 'title', 'aria-label', 'alt'];
    const processElement = (root: Node) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      if (root.nodeType === Node.TEXT_NODE) nodes.push(root as Text);
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      for (const node of nodes) {
        const parent = node.parentElement;
        if (!parent || parent.closest('[data-no-translate]') || ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)) continue;
        const current = node.nodeValue || '';
        if (language === 'en' && /[\u0600-\u06ff٠-٩]/.test(current)) {
          originalTextNodes.set(node, current);
          node.nodeValue = translateUiText(current);
        } else if (language === 'ar' && originalTextNodes.has(node)) {
          const saved = originalTextNodes.get(node)!;
          if (current !== saved) node.nodeValue = saved;
        }
      }
      const elements: Element[] = root.nodeType === Node.ELEMENT_NODE ? [root as Element, ...(root as Element).querySelectorAll('*')] : [];
      for (const element of elements) {
        if (element.closest('[data-no-translate]')) continue;
        for (const attribute of attributes) {
          const current = element.getAttribute(attribute);
          if (!current) continue;
          if (language === 'en' && /[\u0600-\u06ff٠-٩]/.test(current)) {
            const saved = originalElementAttributes.get(element) || new Map<string, string>();
            saved.set(attribute, current);
            originalElementAttributes.set(element, saved);
            element.setAttribute(attribute, translateUiText(current));
          } else if (language === 'ar') {
            const saved = originalElementAttributes.get(element)?.get(attribute);
            if (saved && current !== saved) element.setAttribute(attribute, saved);
          }
        }
      }
    };
    processElement(document.body);
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') processElement(mutation.target);
        for (const node of mutation.addedNodes) processElement(node);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);
  return null;
};
export const LanguageProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [language, setLanguage] = useState<AppLanguage>(() => localStorage.getItem('masar_language') === 'en' ? 'en' : 'ar');
  useEffect(() => { localStorage.setItem('masar_language', language); document.documentElement.lang = language; document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'; }, [language]);
  const value = useMemo<ContextValue>(() => ({ language, toggleLanguage: () => setLanguage(v => v === 'ar' ? 'en' : 'ar'), t: key => translations[key][language] }), [language]);
  return <LanguageContext.Provider value={value}><DomLocalizer language={language} />{children}</LanguageContext.Provider>;
};
export const useLanguage = () => { const value = useContext(LanguageContext); if (!value) throw new Error('LanguageProvider is missing'); return value; };
