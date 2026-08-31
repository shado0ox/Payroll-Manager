import fs from 'node:fs';

const path = 'src/components/DashboardView.tsx';
let source = fs.readFileSync(path, 'utf8');

source = source.replace(
  "new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', { month: 'long', year: 'numeric' })",
  "new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US', { month: 'long', year: 'numeric' })"
);

const countsAnchor = `  const missingBankAlerts = lifecycleAlerts.filter(a => a.type === 'MISSING_BANK_ACCOUNT').length;`;
if (!source.includes(countsAnchor) && !source.includes('const topLifecycleAlerts = lifecycleAlerts')) {
  throw new Error('Lifecycle dashboard counts anchor not found');
}
source = source.replace(
  countsAnchor,
  `${countsAnchor}\n  const topLifecycleAlerts = lifecycleAlerts\n    .slice()\n    .sort((a, b) => {\n      const rank = { EXPIRED: 0, URGENT: 1, WARNING: 2, INFO: 3 } as const;\n      const severityDiff = rank[a.severity] - rank[b.severity];\n      if (severityDiff !== 0) return severityDiff;\n      return String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31'));\n    })\n    .slice(0, 8);`
);

const marker = `      {/* 1. Top 4 KPI Cards - Professional Polish */}`;
if (!source.includes(marker) && !source.includes('Lifecycle alert drill-down')) {
  throw new Error('Dashboard lifecycle drill-down anchor not found');
}

if (!source.includes('Lifecycle alert drill-down')) {
  const block = `      {/* Lifecycle alert drill-down */}\n      {topLifecycleAlerts.length > 0 && (\n        <section className="bg-white rounded-2xl border border-amber-200 shadow-xs overflow-hidden">\n          <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/60 flex flex-wrap items-center justify-between gap-3">\n            <div>\n              <h3 className="font-black text-slate-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" />{tr('تنبيهات الموظفين التي تحتاج متابعة', 'Employee alerts requiring follow-up')}</h3>\n              <p className="text-[11px] text-slate-500 mt-1">{tr('الأولوية للأكثر إلحاحًا ثم الأقرب موعدًا', 'Most urgent alerts are shown first, then nearest due dates')}</p>\n            </div>\n            <button type="button" onClick={() => onNavigate('employees')} className="px-3 py-2 rounded-xl border border-amber-200 bg-white text-xs font-bold text-amber-800 hover:bg-amber-50">{tr('عرض الموظفين', 'View employees')}</button>\n          </div>\n          <div className="divide-y divide-slate-100">\n            {topLifecycleAlerts.map(alert => {\n              const emp = companyEmployees.find(employee => employee.id === alert.employeeId);\n              const typeLabel = alert.type === 'IQAMA_EXPIRY'\n                ? tr('انتهاء إقامة', 'Iqama expiry')\n                : alert.type === 'SAUDI_CONTRACT_EXPIRY'\n                  ? tr('انتهاء عقد سعودي', 'Saudi contract expiry')\n                  : alert.type === 'NEW_HIRE_ENTRY_DEADLINE'\n                    ? tr('مهلة القادم الجديد', 'New-arrival deadline')\n                    : tr('حساب بنكي غير مكتمل', 'Missing bank account');\n              const severityLabel = alert.severity === 'EXPIRED'\n                ? tr('منتهي', 'Expired')\n                : alert.severity === 'URGENT'\n                  ? tr('عاجل', 'Urgent')\n                  : alert.severity === 'WARNING'\n                    ? tr('تنبيه', 'Warning')\n                    : tr('معلومة', 'Info');\n              return (\n                <div key={alert.type + '-' + alert.employeeId + '-' + (alert.dueDate || 'none')} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">\n                  <div className="min-w-0">\n                    <div className="font-bold text-sm text-slate-900 truncate">{emp ? (emp.firstNameAr + ' ' + emp.lastNameAr) : alert.employeeName}</div>\n                    <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">\n                      <span>{typeLabel}</span>\n                      {alert.dueDate && <span className="font-mono">{alert.dueDate}</span>}\n                      {typeof alert.daysRemaining === 'number' && <span>{alert.daysRemaining < 0 ? tr('متأخر ' + Math.abs(alert.daysRemaining) + ' يوم', Math.abs(alert.daysRemaining) + ' days overdue') : tr('متبقي ' + alert.daysRemaining + ' يوم', alert.daysRemaining + ' days remaining')}</span>}\n                    </div>\n                  </div>\n                  <div className="flex items-center gap-2">\n                    <span className="px-2 py-1 rounded-lg border border-amber-200 bg-amber-50 text-[10px] font-black text-amber-800">{severityLabel}</span>\n                    {emp && onViewEmployeeStatement && (\n                      <button type="button" onClick={() => onViewEmployeeStatement(emp)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-700 hover:bg-slate-50">{tr('فتح الملف', 'Open record')}</button>\n                    )}\n                  </div>\n                </div>\n              );\n            })}\n          </div>\n        </section>\n      )}\n\n`;
  source = source.replace(marker, block + marker);
}

fs.writeFileSync(path, source);
console.log('Lifecycle dashboard drill-down and Gregorian period labels applied.');
