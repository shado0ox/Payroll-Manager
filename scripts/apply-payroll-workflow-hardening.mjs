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
// New-user fields must also not invite the browser/password manager to inject the
// currently signed-in administrator credentials into the username/password hints.
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
  source = replaceOnce(
    source,
    `                    placeholder={language === 'ar' ? 'مثال: ahmed_hr' : 'Example: ahmed_hr'}\n                    className=`,
    `                    placeholder={language === 'ar' ? 'أدخل اسم مستخدم جديد' : 'Enter a new username'}\n                    autoComplete="off"\n                    name="new-user-username"\n                    className=`,
    'neutral username hint and disable admin autofill'
  );
  source = replaceOnce(
    source,
    `                {/* Password */}\n                <div>\n                  <label className="block text-xs font-bold text-slate-700 mb-1">\n                    {language === 'ar' ? 'كلمة المرور' : 'Password'} <span className="text-rose-500">*</span>\n                  </label>\n                  <div className="relative">\n                    <input\n                      type={showPassword ? 'text' : 'password'}\n                      required\n                      value={formData.password}\n                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}\n                      placeholder={language === 'ar' ? 'كلمة المرور' : 'Password'}\n                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-emerald-500"\n                      dir="ltr"\n                    />\n                    <button\n                      type="button"\n                      onClick={() => setShowPassword(!showPassword)}\n                      className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"\n                    >\n                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}\n                    </button>\n                  </div>\n                </div>`,
    `                {/* Password is only set when creating a user. Existing users reset it from the login screen. */}\n                {!editingUser && <div>\n                  <label className="block text-xs font-bold text-slate-700 mb-1">\n                    {language === 'ar' ? 'كلمة المرور' : 'Password'} <span className="text-rose-500">*</span>\n                  </label>\n                  <div className="relative">\n                    <input\n                      type={showPassword ? 'text' : 'password'}\n                      required\n                      value={formData.password}\n                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}\n                      placeholder={language === 'ar' ? 'أنشئ كلمة مرور جديدة' : 'Create a new password'}\n                      autoComplete="new-password"\n                      name="new-user-password"\n                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-emerald-500"\n                      dir="ltr"\n                    />\n                    <button\n                      type="button"\n                      onClick={() => setShowPassword(!showPassword)}\n                      className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"\n                    >\n                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}\n                    </button>\n                  </div>\n                </div>}`,
    'hide password on edit and use new-password autocomplete'
  );
  source = replaceOnce(
    source,
    `title={language === 'ar' ? 'تعديل بيانات المستخدم وكلمة المرور' : 'Edit user details and password'}`,
    `title={language === 'ar' ? 'تعديل بيانات المستخدم والصلاحيات' : 'Edit user details and permissions'}`,
    'remove password-reset implication from edit action'
  );
  fs.writeFileSync(files.users, source);
}

console.log('Payroll workflow hardening transform applied.');
