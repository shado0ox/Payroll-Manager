import fs from 'node:fs';

const path = 'src/components/LoansPenaltiesView.tsx';
let source = fs.readFileSync(path, 'utf8');

const anchor = `              <div>\n                <label className="block font-semibold text-slate-700 mb-1">{tr('سبب الجزاء الإداري *', 'Penalty reason *')}</label>`;
const block = `              <div>\n                <label className="block font-semibold text-slate-700 mb-1">{tr('فترة الراتب التي يطبق عليها الخصم *', 'Payroll period for this deduction *')}</label>\n                <input\n                  type="month"\n                  required\n                  value={penaltyForm.periodMonth}\n                  onChange={(e) => setPenaltyForm({ ...penaltyForm, periodMonth: e.target.value })}\n                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"\n                />\n                <p className="mt-1 text-[10px] text-slate-500">\n                  {tr('يمكن اختيار شهر سابق مثل 2026-07؛ سيُطبق الخصم على رصيد هذا الشهر عند إعادة الاحتساب طالما الموظف لم يتم تحويل راتبه.', 'You can select a prior month such as 2026-07; the deduction will affect that period on recalculation as long as the employee has not been transferred.')}\n                </p>\n              </div>\n\n${anchor}`;

if (!source.includes('type="month"\n                  required\n                  value={penaltyForm.periodMonth}')) {
  if (!source.includes(anchor)) throw new Error('Missing deduction period form anchor');
  source = source.replace(anchor, block);
}

fs.writeFileSync(path, source);
console.log('Editable deduction payroll period applied.');
