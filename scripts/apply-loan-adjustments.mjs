import fs from 'node:fs';

function patchFile(relativePath, transform) {
  const url = new URL(`../${relativePath}`, import.meta.url);
  const source = fs.readFileSync(url, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(url, next);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Missing loan adjustment anchor: ${label}`);
  return source.replace(before, after);
}

patchFile('src/types/index.ts', (initial) => {
  let source = initial;
  const anchor = `export interface LoanSchedule {`;
  const addition = `export interface LoanAdjustment {\n  id: string;\n  amount: number; // positive increases the receivable, negative reduces it\n  date: string;\n  reason: string;\n  createdAt: string;\n  createdBy?: string;\n}\n\n${anchor}`;
  source = replaceOnce(source, anchor, addition, 'loan adjustment type');
  source = replaceOnce(source, `  reason: string;\n}\n\nexport interface PenaltyRecord`, `  reason: string;\n  adjustments?: LoanAdjustment[];\n}\n\nexport interface PenaltyRecord`, 'loan adjustment field');
  return source;
});

patchFile('src/App.tsx', (initial) => {
  let source = initial;
  const deleteAnchor = `  const handleDeleteLoan = (loanId: string) => {\n    setState(prev => {\n      const updated = prev.loans.filter(item => item.id !== loanId);\n      saveLoans(updated);\n      return { ...prev, loans: updated };\n    });\n  };`;
  const withHandler = `${deleteAnchor}\n\n  const handleAdjustLoan = (loanId: string, amount: number, reason: string, date: string) => {\n    if (!Number.isFinite(amount) || amount === 0 || !reason.trim() || !date) return;\n    setState(prev => {\n      const existing = prev.loans.find(item => item.id === loanId);\n      if (!existing) return prev;\n      const nextBalance = Number((existing.remainingAmount + amount).toFixed(2));\n      if (nextBalance < 0) {\n        alert(tr('لا يمكن أن تجعل التسوية رصيد السلفة أقل من صفر.', 'The adjustment cannot make the loan balance negative.'));\n        return prev;\n      }\n      const adjustment = {\n        id: \`loan-adj-\${Date.now()}\`, amount, date, reason: reason.trim(),\n        createdAt: new Date().toISOString(), createdBy: prev.currentUser?.id,\n      };\n      const updated = prev.loans.map(item => item.id === loanId ? {\n        ...item,\n        remainingAmount: nextBalance,\n        status: nextBalance === 0 ? 'COMPLETED' as const : item.status,\n        adjustments: [...(item.adjustments || []), adjustment],\n      } : item);\n      saveLoans(updated);\n      return { ...prev, loans: updated };\n    });\n  };`;
  source = replaceOnce(source, deleteAnchor, withHandler, 'App loan adjustment handler');
  source = replaceOnce(source, `                onDeleteLoan={handleDeleteLoan}\n`, `                onDeleteLoan={handleDeleteLoan}\n                onAdjustLoan={handleAdjustLoan}\n`, 'App loan adjustment prop');
  return source;
});

patchFile('src/components/LoansPenaltiesView.tsx', (initial) => {
  let source = initial;
  source = replaceOnce(source, `  onDeleteLoan: (loanId: string) => void;\n`, `  onDeleteLoan: (loanId: string) => void;\n  onAdjustLoan: (loanId: string, amount: number, reason: string, date: string) => void;\n`, 'loan adjustment prop type');
  source = replaceOnce(source, `  onDeleteLoan,\n  onSavePenalty,`, `  onDeleteLoan,\n  onAdjustLoan,\n  onSavePenalty,`, 'loan adjustment prop destructure');
  source = replaceOnce(source, `                        <td className="py-3 px-4 font-bold text-slate-900">{formatSAR(loan.totalAmount)}</td>`, `                        <td className="py-3 px-4 font-bold text-slate-900">\n                          {formatSAR(loan.totalAmount + (loan.adjustments || []).reduce((sum, item) => sum + item.amount, 0))}\n                          {(loan.adjustments || []).length > 0 && <div className="text-[10px] font-medium text-slate-400">{tr('الأصل', 'Original')}: {formatSAR(loan.totalAmount)} · {tr('تسويات', 'Adjustments')}: {(loan.adjustments || []).length}</div>}\n                        </td>`, 'adjusted principal display');
  source = replaceOnce(source, `                          <button onClick={() => openEditLoan(loan)} className="text-blue-700" title={tr('تعديل السلفة', 'Edit loan')}><Edit3 className="w-4 h-4" /></button>`, `                          <button onClick={() => {\n                            const raw = prompt(tr('أدخل مبلغ التسوية: قيمة سالبة لتخفيض السلفة أو موجبة لزيادتها', 'Enter adjustment amount: negative to reduce the loan or positive to increase it'));\n                            if (raw == null) return;\n                            const amount = Number(raw);\n                            if (!Number.isFinite(amount) || amount === 0) return alert(tr('مبلغ التسوية غير صحيح.', 'Invalid adjustment amount.'));\n                            const reason = prompt(tr('سبب التسوية *', 'Adjustment reason *')) || '';\n                            if (!reason.trim()) return alert(tr('سبب التسوية مطلوب.', 'Adjustment reason is required.'));\n                            const date = prompt(tr('تاريخ التسوية YYYY-MM-DD', 'Adjustment date YYYY-MM-DD'), new Date().toISOString().slice(0,10)) || '';\n                            if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) return alert(tr('تاريخ التسوية غير صحيح.', 'Invalid adjustment date.'));\n                            onAdjustLoan(loan.id, amount, reason, date);\n                          }} className="text-violet-700" title={tr('تسوية السلفة', 'Adjust loan balance')}><DollarSign className="w-4 h-4" /></button>\n                          <button onClick={() => openEditLoan(loan)} className="text-blue-700" title={tr('تعديل السلفة', 'Edit loan')}><Edit3 className="w-4 h-4" /></button>`, 'loan adjustment button');
  return source;
});

patchFile('server/index.mjs', (initial) => {
  let source = initial;
  const anchor = `function validateClosedPayrollInputs(stored, incoming) {`;
  if (!source.includes(anchor)) throw new Error('Loan adjustments require payroll input locks to run first');
  const helper = `const isAppendOnlyLoanAdjustment = (beforeLoan, afterLoan) => {\n  if (!beforeLoan || !afterLoan) return false;\n  const beforeAdjustments = asArray(beforeLoan.adjustments);\n  const afterAdjustments = asArray(afterLoan.adjustments);\n  if (afterAdjustments.length !== beforeAdjustments.length + 1) return false;\n  if (!sameJson(beforeAdjustments, afterAdjustments.slice(0, -1))) return false;\n  const adjustment = afterAdjustments[afterAdjustments.length - 1];\n  if (!adjustment || typeof adjustment.id !== 'string' || !adjustment.id\n    || !Number.isFinite(Number(adjustment.amount)) || Number(adjustment.amount) === 0\n    || typeof adjustment.reason !== 'string' || !adjustment.reason.trim()\n    || typeof adjustment.date !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(adjustment.date)) return false;\n  const immutableKeys = ['id','companyId','employeeId','totalAmount','monthlyInstallment','totalInstallments','remainingInstallments','startDate','reason'];\n  if (immutableKeys.some(key => !sameJson(beforeLoan[key], afterLoan[key]))) return false;\n  const expectedBalance = Number((Number(beforeLoan.remainingAmount || 0) + Number(adjustment.amount)).toFixed(2));\n  if (expectedBalance < 0 || Number(afterLoan.remainingAmount) !== expectedBalance) return false;\n  if (afterLoan.status !== beforeLoan.status && !(expectedBalance === 0 && afterLoan.status === 'COMPLETED')) return false;\n  return true;\n};\n\n${anchor}`;
  source = replaceOnce(source, anchor, helper, 'server loan adjustment helper');

  const oldLoop = `    for (const row of changedPayrollSourceRows(stored?.[key], incoming?.[key])) {\n      if (payrollSourceLocked(stored, kind, row)) throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');\n    }`;
  const newLoop = `    const beforeById = new Map(asArray(stored?.[key]).map(row => [row.id, row]));\n    const afterById = new Map(asArray(incoming?.[key]).map(row => [row.id, row]));\n    for (const row of changedPayrollSourceRows(stored?.[key], incoming?.[key])) {\n      if (!payrollSourceLocked(stored, kind, row)) continue;\n      if (kind === 'loan' && isAppendOnlyLoanAdjustment(beforeById.get(row.id), afterById.get(row.id))) continue;\n      throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');\n    }`;
  source = replaceOnce(source, oldLoop, newLoop, 'server allow append-only loan adjustment');
  return source;
});

console.log('Loan adjustment workflow applied.');
