import fs from 'node:fs';

const files = {
  payroll: new URL('../src/components/PayrollRunsView.tsx', import.meta.url),
  users: new URL('../src/components/UserManagementView.tsx', import.meta.url),
};

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing transform anchor: ${label}`);
  return source.replace(before, after);
}

// 1) Payroll: never recalculate an approved/posted run or one with an active payment batch.
{
  let source = fs.readFileSync(files.payroll, 'utf8');
  const oldBlock = `  const handleRecalculate = () => {\n    if (currentRun?.paymentBatches?.some(batch => batch.status === 'PAID')) {\n      alert(tr('لا يمكن إعادة احتساب المسير بعد تسجيل دفعة محولة. ألغِ حالة التحويل أو أنشئ تسوية مستقلة.', 'Payroll cannot be recalculated after a paid batch. Reverse the payment or create a separate settlement.'));\n      return;\n    }`;
  const newBlock = `  const handleRecalculate = () => {\n    if (currentRun && ['APPROVED', 'POSTED'].includes(currentRun.status)) {\n      alert(tr('لا يمكن إعادة احتساب مسير معتمد أو مرحل. يجب التراجع عن الاعتماد أولًا، ولا يمكن فتح المسير إذا وُجدت دفعة مدفوعة.', 'An approved or posted payroll cannot be recalculated. Reopen it first; a paid payroll cannot be reopened.'));\n      return;\n    }\n    if (currentRun?.paymentBatches?.some(batch => ['SCHEDULED', 'PAID'].includes(batch.status))) {\n      alert(tr('لا يمكن إعادة احتساب المسير مع وجود دفعة تحويل مجدولة أو مدفوعة. ألغِ الدفعة المجدولة أولًا.', 'Payroll cannot be recalculated while a scheduled or paid payment batch exists. Cancel the scheduled batch first.'));\n      return;\n    }`;
  source = replaceOnce(source, oldBlock, newBlock, 'payroll recalculation lock');
  fs.writeFileSync(files.payroll, source);
}

// 2) User administration: editing permissions must never reuse or require the employee password.
{
  let source = fs.readFileSync(files.users, 'utf8');
  source = replaceOnce(
    source,
    `      password: user.password || '',`,
    `      password: '',`,
    'clear password on edit'
  );
  source = replaceOnce(
    source,
    `      password: formData.password,`,
    `      password: editingUser ? '' : formData.password,`,
    'do not send password on edit'
  );
  fs.writeFileSync(files.users, source);
}

console.log('Payroll workflow hardening transform applied.');
