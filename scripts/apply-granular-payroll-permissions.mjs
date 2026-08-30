import fs from 'node:fs';

function patchFile(relativePath, transform) {
  const url = new URL(`../${relativePath}`, import.meta.url);
  const source = fs.readFileSync(url, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(url, next);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Missing granular payroll permission anchor: ${label}`);
  return source.replace(before, after);
}

patchFile('src/types/index.ts', (initial) => {
  let source = initial;
  source = replaceOnce(
    source,
    `  | 'APPROVE_PAYROLL'\n  | 'POST_PAYROLL'`,
    `  | 'APPROVE_PAYROLL'\n  | 'REVERSE_PAYROLL_APPROVAL'\n  | 'POST_PAYROLL'\n  | 'CONFIRM_PAYROLL_PAYMENT'\n  | 'REVERSE_PAYROLL_PAYMENT'`,
    'frontend permission type',
  );
  source = replaceOnce(
    source,
    `  paymentDate?: string;\n  reference?: string;`,
    `  paymentDate?: string;\n  paymentReversalReason?: string;\n  paymentReversedAt?: string;\n  reversedPaymentDate?: string;\n  reference?: string;`,
    'payment reversal metadata type',
  );
  return source;
});

patchFile('src/utils/permissions.ts', (initial) => {
  let source = initial;
  source = replaceOnce(
    source,
    `  'MANAGE_ATTENDANCE', 'MANAGE_LOANS_PENALTIES', 'MANAGE_PAYROLL', 'APPROVE_PAYROLL',\n  'POST_PAYROLL', 'MANAGE_JOURNALS'`,
    `  'MANAGE_ATTENDANCE', 'MANAGE_LOANS_PENALTIES', 'MANAGE_PAYROLL', 'APPROVE_PAYROLL',\n  'REVERSE_PAYROLL_APPROVAL', 'POST_PAYROLL', 'CONFIRM_PAYROLL_PAYMENT', 'REVERSE_PAYROLL_PAYMENT', 'MANAGE_JOURNALS'`,
    'frontend permission list',
  );
  source = replaceOnce(
    source,
    `  APPROVE_PAYROLL: { ar: 'اعتماد وإلغاء اعتماد المسير', en: 'Approve and reverse payroll approval' },\n  POST_PAYROLL: { ar: 'ترحيل الرواتب وأوامر الدفع', en: 'Post payroll and payment orders' },`,
    `  APPROVE_PAYROLL: { ar: 'اعتماد مسير الرواتب', en: 'Approve payroll run' },\n  REVERSE_PAYROLL_APPROVAL: { ar: 'إلغاء اعتماد وإرجاع المسير للتعديل', en: 'Reverse payroll approval / reopen run' },\n  POST_PAYROLL: { ar: 'إقفال وترحيل مسير الرواتب', en: 'Close and post payroll run' },\n  CONFIRM_PAYROLL_PAYMENT: { ar: 'تأكيد تنفيذ دفعات الرواتب', en: 'Confirm payroll payments' },\n  REVERSE_PAYROLL_PAYMENT: { ar: 'إلغاء إثبات دفع راتب', en: 'Reverse confirmed payroll payment' },`,
    'frontend permission labels',
  );
  source = replaceOnce(
    source,
    `  return ['VIEW_DASHBOARD', 'MANAGE_EMPLOYEES', 'MANAGE_ATTENDANCE', 'MANAGE_LOANS_PENALTIES', 'MANAGE_PAYROLL', 'POST_PAYROLL', 'VIEW_REPORTS'];`,
    `  return ['VIEW_DASHBOARD', 'MANAGE_EMPLOYEES', 'MANAGE_ATTENDANCE', 'MANAGE_LOANS_PENALTIES', 'MANAGE_PAYROLL', 'POST_PAYROLL', 'CONFIRM_PAYROLL_PAYMENT', 'VIEW_REPORTS'];`,
    'operations default payment confirmation',
  );
  return source;
});

patchFile('src/components/PayrollRunsView.tsx', (initial) => {
  let source = initial;
  const oldPaymentHandler = `  const handlePaymentBatchStatus = (batchId: string, status: PaymentBatchStatus) => {\n    if (!currentRun) return;\n    const paymentBatches = (currentRun.paymentBatches || []).map(batch => batch.id === batchId ? {\n      ...batch,\n      status,\n      paymentDate: status === 'PAID' ? new Date().toISOString().slice(0, 10) : batch.paymentDate,\n    } : batch);\n    onSavePayrollRun({ ...currentRun, paymentBatches });\n  };`;
  const newPaymentHandler = `  const handlePaymentBatchStatus = (batchId: string, status: PaymentBatchStatus) => {\n    if (!currentRun) return;\n    if (status === 'PAID' && !hasPermission({ role: activeRole, permissions } as any, 'CONFIRM_PAYROLL_PAYMENT')) {\n      alert(tr('ليس لديك صلاحية تأكيد تنفيذ دفعة الرواتب.', 'You do not have permission to confirm payroll payment.'));\n      return;\n    }\n    const paymentBatches = (currentRun.paymentBatches || []).map(batch => batch.id === batchId ? {\n      ...batch,\n      status,\n      paymentDate: status === 'PAID' ? new Date().toISOString().slice(0, 10) : batch.paymentDate,\n    } : batch);\n    onSavePayrollRun({ ...currentRun, paymentBatches });\n  };\n\n  const handleReversePayment = (batchId: string) => {\n    if (!currentRun || !hasPermission({ role: activeRole, permissions } as any, 'REVERSE_PAYROLL_PAYMENT')) return;\n    const batch = (currentRun.paymentBatches || []).find(item => item.id === batchId);\n    if (!batch || batch.status !== 'PAID') return;\n    const reason = window.prompt(tr('اكتب سبب إلغاء إثبات الدفع (إلزامي):', 'Enter the payment reversal reason (required):'))?.trim() || '';\n    if (!reason) return;\n    if (!window.confirm(tr('سيتم إرجاع الدفعة إلى مجدولة بدون فتح المسير أو تعديل استحقاقاته. متابعة؟', 'The batch will return to Scheduled without reopening payroll or changing payroll calculations. Continue?'))) return;\n    const paymentBatches = (currentRun.paymentBatches || []).map(item => item.id === batchId ? {\n      ...item,\n      status: 'SCHEDULED' as const,\n      reversedPaymentDate: item.paymentDate,\n      paymentDate: undefined,\n      paymentReversalReason: reason,\n      paymentReversedAt: new Date().toISOString(),\n    } : item);\n    onSavePayrollRun({ ...currentRun, paymentBatches });\n  };`;
  source = replaceOnce(source, oldPaymentHandler, newPaymentHandler, 'payment handlers');

  const oldWorkflow = `  const handleStatusChange = (newStatus: PayrollRunStatus) => {\n    if (!currentRun) return;\n    const permission = newStatus === 'APPROVED' ? 'APPROVE_PAYROLL' : newStatus === 'POSTED' ? 'POST_PAYROLL' : 'MANAGE_PAYROLL';\n    if (!hasPermission({ role: activeRole, permissions } as any, permission)) {`;
  const newWorkflow = `  const handleStatusChange = (newStatus: PayrollRunStatus) => {\n    if (!currentRun) return;\n    const transition = currentRun.status + '->' + newStatus;\n    const permission: UserPermission = transition === 'UNDER_REVIEW->APPROVED'\n      ? 'APPROVE_PAYROLL'\n      : transition === 'APPROVED->UNDER_REVIEW' || transition === 'POSTED->APPROVED'\n        ? 'REVERSE_PAYROLL_APPROVAL'\n        : transition === 'APPROVED->POSTED'\n          ? 'POST_PAYROLL'\n          : 'MANAGE_PAYROLL';\n    if (!hasPermission({ role: activeRole, permissions } as any, permission)) {`;
  source = replaceOnce(source, oldWorkflow, newWorkflow, 'workflow permission selection');
  source = replaceOnce(
    source,
    `  const canReversePosting = hasPermission({ role: activeRole, permissions } as any, 'APPROVE_PAYROLL');`,
    `  const canReversePosting = hasPermission({ role: activeRole, permissions } as any, 'REVERSE_PAYROLL_APPROVAL');`,
    'reverse approval permission',
  );
  source = replaceOnce(
    source,
    `    onSavePayrollRun({ ...currentRun, status: 'UNDER_REVIEW', approvedAt: undefined, approvedBy: undefined, postedAt: undefined, postedBy: undefined });`,
    `    onSavePayrollRun({ ...currentRun, status: 'APPROVED', postedAt: undefined, postedBy: undefined });`,
    'reverse posted run to approved',
  );
  source = replaceOnce(
    source,
    `                          <button type="button" onClick={() => handlePaymentBatchStatus(batch.id, 'PAID')} className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold">{tr('تم التحويل', 'Mark paid')}</button>`,
    `                          <button type="button" disabled={!hasPermission({ role: activeRole, permissions } as any, 'CONFIRM_PAYROLL_PAYMENT')} onClick={() => handlePaymentBatchStatus(batch.id, 'PAID')} className="px-2 py-1 rounded-lg bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold">{tr('تم التحويل', 'Mark paid')}</button>`,
    'confirm payment button permission',
  );
  source = replaceOnce(
    source,
    `                        {batch.status === 'PAID' && (\n                          <button type="button" onClick={() => exportQoyodJournalCsv(generatePaymentJournalBatch(company, currentRun, batch), company)} className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 font-bold">{tr('قيد السداد', 'Payment journal')}</button>\n                        )}`,
    `                        {batch.status === 'PAID' && (<>\n                          <button type="button" onClick={() => exportQoyodJournalCsv(generatePaymentJournalBatch(company, currentRun, batch), company)} className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 font-bold">{tr('قيد السداد', 'Payment journal')}</button>\n                          {hasPermission({ role: activeRole, permissions } as any, 'REVERSE_PAYROLL_PAYMENT') && <button type="button" onClick={() => handleReversePayment(batch.id)} className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-bold">{tr('إلغاء إثبات الدفع', 'Reverse payment')}</button>}\n                        </>)}`,
    'reverse payment button',
  );
  return source;
});

patchFile('server/index.mjs', (initial) => {
  let source = initial;
  source = replaceOnce(
    source,
    `const ALL_PERMISSIONS = new Set(['VIEW_DASHBOARD','MANAGE_COMPANY_PROFILE','MANAGE_COMPANIES','MANAGE_EMPLOYEES','MANAGE_ATTENDANCE','MANAGE_LOANS_PENALTIES','MANAGE_PAYROLL','APPROVE_PAYROLL','POST_PAYROLL','MANAGE_JOURNALS','VIEW_REPORTS','MANAGE_USERS','VIEW_AUDIT_LOGS']);`,
    `const ALL_PERMISSIONS = new Set(['VIEW_DASHBOARD','MANAGE_COMPANY_PROFILE','MANAGE_COMPANIES','MANAGE_EMPLOYEES','MANAGE_ATTENDANCE','MANAGE_LOANS_PENALTIES','MANAGE_PAYROLL','APPROVE_PAYROLL','REVERSE_PAYROLL_APPROVAL','POST_PAYROLL','CONFIRM_PAYROLL_PAYMENT','REVERSE_PAYROLL_PAYMENT','MANAGE_JOURNALS','VIEW_REPORTS','MANAGE_USERS','VIEW_AUDIT_LOGS']);`,
    'server permission set',
  );
  source = replaceOnce(
    source,
    `  OPERATIONS_MANAGER: ['VIEW_DASHBOARD','MANAGE_EMPLOYEES','MANAGE_ATTENDANCE','MANAGE_LOANS_PENALTIES','MANAGE_PAYROLL','POST_PAYROLL','VIEW_REPORTS'],`,
    `  OPERATIONS_MANAGER: ['VIEW_DASHBOARD','MANAGE_EMPLOYEES','MANAGE_ATTENDANCE','MANAGE_LOANS_PENALTIES','MANAGE_PAYROLL','POST_PAYROLL','CONFIRM_PAYROLL_PAYMENT','VIEW_REPORTS'],`,
    'server operations defaults',
  );
  source = replaceOnce(
    source,
    `      if ((transition === 'UNDER_REVIEW->APPROVED' || transition === 'APPROVED->UNDER_REVIEW') && !can(user, 'APPROVE_PAYROLL')) {\n        throw workflowError(403, 'APPROVE_PAYROLL_REQUIRED');\n      }\n      if ((transition === 'APPROVED->POSTED' || transition === 'POSTED->APPROVED') && !can(user, 'POST_PAYROLL')) {\n        throw workflowError(403, 'POST_PAYROLL_REQUIRED');\n      }`,
    `      if (transition === 'UNDER_REVIEW->APPROVED' && !can(user, 'APPROVE_PAYROLL')) {\n        throw workflowError(403, 'APPROVE_PAYROLL_REQUIRED');\n      }\n      if ((transition === 'APPROVED->UNDER_REVIEW' || transition === 'POSTED->APPROVED') && !can(user, 'REVERSE_PAYROLL_APPROVAL')) {\n        throw workflowError(403, 'REVERSE_PAYROLL_APPROVAL_REQUIRED');\n      }\n      if (transition === 'APPROVED->POSTED' && !can(user, 'POST_PAYROLL')) {\n        throw workflowError(403, 'POST_PAYROLL_REQUIRED');\n      }`,
    'server split approval permissions',
  );
  source = replaceOnce(
    source,
    `      if (oldBatch.status === 'PAID' && !sameJson(oldBatch, nextBatch)) throw workflowError(409, 'PAID_BATCH_IMMUTABLE');`,
    `      const isPaidReversal = oldBatch.status === 'PAID' && nextBatch.status === 'SCHEDULED';\n      if (oldBatch.status === 'PAID' && !sameJson(oldBatch, nextBatch) && !isPaidReversal) throw workflowError(409, 'PAID_BATCH_IMMUTABLE');`,
    'allow candidate paid reversal',
  );
  source = replaceOnce(
    source,
    `        if (paymentTransition === 'SCHEDULED->PAID') {\n          if (!can(user, 'POST_PAYROLL')) throw workflowError(403, 'POST_PAYROLL_REQUIRED');`,
    `        if (paymentTransition === 'SCHEDULED->PAID') {\n          if (!can(user, 'CONFIRM_PAYROLL_PAYMENT')) throw workflowError(403, 'CONFIRM_PAYROLL_PAYMENT_REQUIRED');`,
    'confirm payment permission',
  );
  source = replaceOnce(
    source,
    `        } else if (paymentTransition === 'SCHEDULED->FAILED' || paymentTransition === 'SCHEDULED->CANCELLED') {`,
    `        } else if (paymentTransition === 'PAID->SCHEDULED') {\n          if (!can(user, 'REVERSE_PAYROLL_PAYMENT')) throw workflowError(403, 'REVERSE_PAYROLL_PAYMENT_REQUIRED');\n          if (Number(oldBatch.totalAmount || 0) !== Number(nextBatch.totalAmount || 0)\n            || !sameJson(asArray(oldBatch.employeeIds), asArray(nextBatch.employeeIds))\n            || !sameJson(oldBatch.method, nextBatch.method)\n            || !sameJson(oldBatch.scheduledDate, nextBatch.scheduledDate)\n            || !sameJson(oldBatch.reference, nextBatch.reference)\n            || !sameJson(oldBatch.notes, nextBatch.notes)) throw workflowError(409, 'PAYMENT_BATCH_SCOPE_CHANGED');\n          if (typeof nextBatch.paymentReversalReason !== 'string' || !nextBatch.paymentReversalReason.trim()\n            || typeof nextBatch.paymentReversedAt !== 'string' || !nextBatch.paymentReversedAt\n            || nextBatch.paymentDate != null\n            || String(nextBatch.reversedPaymentDate || '') !== String(oldBatch.paymentDate || '')) {\n            throw workflowError(409, 'PAYMENT_REVERSAL_METADATA_REQUIRED');\n          }\n        } else if (paymentTransition === 'SCHEDULED->FAILED' || paymentTransition === 'SCHEDULED->CANCELLED') {`,
    'paid reversal validation',
  );
  return source;
});

console.log('Granular payroll permissions and payment reversal applied.');
