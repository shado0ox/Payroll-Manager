import { Company, Employee, LoanSchedule, PenaltyRecord } from '../types';

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const money = (value: number): string => `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)} SR`;
const employeeNameAr = (employee: Employee) => `${employee.firstNameAr || ''} ${employee.lastNameAr || ''}`.trim();
const employeeNameEn = (employee: Employee) => `${employee.firstNameEn || ''} ${employee.lastNameEn || ''}`.trim();
const safeLogo = (logo?: string): string => logo && /^(data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,|https?:\/\/)/i.test(logo) ? logo : '';

const row = (ar: string, en: string, value: unknown) => `
  <div class="field"><div class="label"><b>${escapeHtml(ar)}</b><span>${escapeHtml(en)}</span></div><div class="value">${escapeHtml(value) || '—'}</div></div>`;

function documentShell(company: Company, employee: Employee, titleAr: string, titleEn: string, reference: string, body: string): string {
  const logo = safeLogo(company.logo);
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(titleEn)} - ${escapeHtml(reference)}</title>
  <style>
    @page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#172033;font-family:Arial,"Tahoma",sans-serif;font-size:11px}.page{width:100%;min-height:274mm;border:1px solid #cbd5e1;padding:10mm;position:relative;overflow:hidden}.accent{height:5px;background:linear-gradient(90deg,#059669,#0d9488);position:absolute;top:0;right:0;left:0}.header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #0f766e;padding-bottom:12px;margin-bottom:14px}.brand{display:flex;align-items:center;gap:12px}.logo{width:64px;height:64px;border:1px solid #dbe5e1;border-radius:12px;object-fit:contain;padding:5px}.logo-fallback{width:64px;height:64px;border-radius:12px;background:#ecfdf5;color:#047857;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900}.company h1{font-size:18px;margin:0 0 5px}.company p{margin:2px 0;color:#64748b;font-size:10px}.ref{text-align:left;direction:ltr;color:#475569;line-height:1.7}.title{text-align:center;margin:10px 0 15px}.title h2{font-size:18px;margin:0;color:#064e3b}.title p{font-size:12px;font-weight:700;color:#64748b;margin:4px 0}.section{border:1px solid #dbe3ea;border-radius:10px;overflow:hidden;margin-bottom:12px}.section-title{background:#f0fdf4;color:#065f46;font-weight:800;padding:7px 10px;border-bottom:1px solid #dbe3ea}.grid{display:grid;grid-template-columns:1fr 1fr}.field{min-height:46px;padding:7px 9px;border-bottom:1px solid #e8edf2;display:flex;align-items:center;gap:8px}.field:nth-child(odd){border-left:1px solid #e8edf2}.label{width:43%;color:#475569;display:flex;flex-direction:column;gap:2px}.label span{font-size:9px;direction:ltr;text-align:right;color:#94a3b8}.value{font-weight:800;direction:ltr;text-align:right;flex:1}.declaration{border:1px solid #a7f3d0;background:#f7fffb;border-radius:10px;padding:11px 13px;line-height:1.8;margin:12px 0}.declaration .en{direction:ltr;text-align:left;color:#475569;border-top:1px dashed #cbd5e1;margin-top:7px;padding-top:7px}.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}.signature{text-align:center;border:1px solid #dbe3ea;border-radius:10px;padding:9px 8px;min-height:82px}.signature b{display:block;color:#334155}.signature span{display:block;color:#94a3b8;font-size:9px;margin-top:3px}.line{border-bottom:1px solid #64748b;margin:30px 10px 0}.footer{position:absolute;bottom:7mm;right:10mm;left:10mm;border-top:1px solid #e2e8f0;padding-top:6px;display:flex;justify-content:space-between;color:#94a3b8;font-size:8px;direction:ltr}.notice{margin-top:8px;text-align:center;color:#64748b;font-size:9px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.page{border:0;min-height:auto;padding:7mm}.footer{bottom:2mm}}
  </style></head><body><div class="page"><div class="accent"></div>
  <header class="header"><div class="brand">${logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="Logo">` : '<div class="logo-fallback">م</div>'}<div class="company"><h1>${escapeHtml(company.nameAr)}</h1><p>${escapeHtml(company.nameEn || company.nameAr)}</p><p>CR: ${escapeHtml(company.crNumber || '—')} &nbsp; | &nbsp; Company code: ${escapeHtml(company.companyCode)}</p></div></div><div class="ref"><b>${escapeHtml(reference)}</b><br>Date: ${escapeHtml(new Date().toISOString().slice(0,10))}</div></header>
  <div class="title"><h2>${escapeHtml(titleAr)}</h2><p>${escapeHtml(titleEn)}</p></div>
  <section class="section"><div class="section-title">بيانات الموظف | Employee Information</div><div class="grid">
  ${row('اسم الموظف', 'Employee name', employeeNameAr(employee))}${row('الاسم بالإنجليزية', 'English name', employeeNameEn(employee) || employeeNameAr(employee))}${row('الرقم الوظيفي', 'Employee number', employee.employeeNo)}${row('الهوية / الإقامة', 'National ID / Iqama', employee.nationalIdOrIqama)}${row('القسم', 'Department', employee.department)}${row('المسمى الوظيفي', 'Job title', employee.jobTitle)}</div></section>
  ${body}
  <div class="signatures"><div class="signature"><b>توقيع الموظف</b><span>Employee Signature</span><div class="line"></div></div><div class="signature"><b>الموارد البشرية</b><span>Human Resources</span><div class="line"></div></div><div class="signature"><b>الاعتماد</b><span>Authorized Approval</span><div class="line"></div></div></div>
  <div class="notice">يُحفظ أصل النموذج في ملف الموظف | The signed original must be retained in the employee file.</div>
  <footer class="footer"><span>Masar Payroll & People</span><span>${escapeHtml(reference)}</span></footer></div></body></html>`;
}

function openPrintDocument(html: string): boolean {
  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (!printWindow) return false;
  printWindow.document.open(); printWindow.document.write(html); printWindow.document.close();
  printWindow.opener = null;
  printWindow.setTimeout(() => { printWindow.focus(); printWindow.print(); }, 500);
  return true;
}

export function printLoanAcknowledgement(company: Company, employee: Employee, loan: LoanSchedule): boolean {
  const reference = `LOAN-${loan.id.replace(/^loan-/, '')}`;
  const body = `<section class="section"><div class="section-title">تفاصيل السلفة | Loan Details</div><div class="grid">
    ${row('إجمالي مبلغ السلفة', 'Total loan amount', money(loan.totalAmount))}${row('القسط الشهري', 'Monthly installment', money(loan.monthlyInstallment))}${row('عدد الأقساط', 'Number of installments', loan.totalInstallments)}${row('فترة بداية الخصم', 'First deduction period', loan.startDate)}${row('سبب السلفة', 'Loan purpose', loan.reason)}${row('حالة الجدولة', 'Schedule status', loan.status)}</div></section>
    <div class="declaration"><b>إقرار الموظف:</b> أقر أنا الموظف الموضحة بياناتي أعلاه باستلام السلفة المبينة، وأوافق على استقطاع القسط الشهري من راتبي ابتداءً من الفترة المحددة وحتى سداد كامل الرصيد، وفق الأنظمة والسياسات المعتمدة.<div class="en"><b>Employee acknowledgment:</b> I acknowledge receipt of the loan stated above and authorize the company to deduct the monthly installment from my salary starting from the specified period until the balance is fully settled, subject to applicable policies and regulations.</div></div>`;
  return openPrintDocument(documentShell(company, employee, 'إقرار استلام وجدولة سلفة موظف', 'Employee Loan Receipt & Deduction Authorization', reference, body));
}

export function printPenaltyAcknowledgement(company: Company, employee: Employee, penalty: PenaltyRecord): boolean {
  const reference = `PEN-${penalty.id.replace(/^pen-/, '')}`;
  const body = `<section class="section"><div class="section-title">تفاصيل الخصم / الجزاء | Deduction / Penalty Details</div><div class="grid">
    ${row('مبلغ الخصم', 'Deduction amount', money(penalty.amount))}${row('فترة تطبيق الخصم', 'Payroll period', penalty.periodMonth)}${row('تاريخ الواقعة', 'Incident date', penalty.date)}${row('حالة التطبيق', 'Application status', penalty.appliedInPayroll ? 'Active / مطبق' : 'Cancelled / ملغى')}</div>${row('سبب الجزاء أو الخصم', 'Reason for penalty or deduction', penalty.reason)}</section>
    <div class="declaration"><b>إفادة الموظف:</b> أقر بالاطلاع على تفاصيل الخصم أو الجزاء الموضحة أعلاه، وقد تم إبلاغي بسبب الإجراء ومبلغه وفترة تطبيقه. ويثبت توقيعي استلامي للإشعار دون أن يخل ذلك بحقي في تقديم اعتراض وفق الإجراءات المعتمدة.<div class="en"><b>Employee notice acknowledgment:</b> I acknowledge that I have reviewed and received notice of the deduction or penalty described above, including its reason, amount and payroll period. My signature confirms receipt of notice without waiving my right to submit an objection under the applicable procedure.</div></div>`;
  return openPrintDocument(documentShell(company, employee, 'إشعار وإقرار خصم أو جزاء إداري', 'Administrative Deduction / Penalty Notice', reference, body));
}
