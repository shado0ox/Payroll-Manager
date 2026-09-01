import fs from 'node:fs';

const viewUrl = new URL('../src/components/EmployeesView.tsx', import.meta.url);

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Missing onboarding completion anchor: ${label}`);
  return source.replace(before, after);
}

let source = fs.readFileSync(viewUrl, 'utf8');

source = replaceOnce(
  source,
  `  FileSpreadsheet
} from 'lucide-react';`,
  `  FileSpreadsheet,
  UserCheck
} from 'lucide-react';`,
  'activation icon',
);

source = replaceOnce(
  source,
  `  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);`,
  `  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isCompletingOnboarding, setIsCompletingOnboarding] = useState(false);`,
  'activation mode state',
);

source = replaceOnce(
  source,
  `  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(emp);`,
  `  const handleOpenEdit = (emp: Employee) => {
    setIsCompletingOnboarding(false);
    setEditingEmployee(emp);`,
  'normal edit reset',
);

source = replaceOnce(
  source,
  `  const handleFormSubmit = async (e: React.FormEvent) => {`,
  `  const handleCompleteOnboarding = (emp: Employee) => {
    const empCopy = JSON.parse(JSON.stringify(emp)) as Employee;
    empCopy.status = 'ACTIVE';
    empCopy.nationalIdOrIqama = '';
    empCopy.bankIban = '';
    empCopy.bankCode = '';
    empCopy.bankName = '';
    empCopy.bankSwiftCode = '';
    setEditingEmployee(emp);
    setIsCompletingOnboarding(true);
    setFormData(empCopy);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {`,
  'activation handler',
);

source = replaceOnce(
  source,
  `      bankSwiftCode: formData.bankSwiftCode ? formData.bankSwiftCode.trim().toUpperCase() : ''
    };`,
  `      bankSwiftCode: formData.bankSwiftCode ? formData.bankSwiftCode.trim().toUpperCase() : ''
    };

    if (isCompletingOnboarding) {
      const iqama = String(processedForm.nationalIdOrIqama || '').replace(/\\D/g, '');
      const iban = String(processedForm.bankIban || '').replace(/\\s/g, '').toUpperCase();
      if (!/^\\d{10}$/.test(iqama)) {
        alert(language === 'ar' ? 'رقم الإقامة يجب أن يتكون من 10 أرقام.' : 'Iqama number must contain exactly 10 digits.');
        return;
      }
      if (!validateSaudiIBAN(iban)) {
        alert(language === 'ar' ? 'أدخل رقم آيبان سعودي صحيح ومكتمل قبل تفعيل الموظف.' : 'Enter a complete valid Saudi IBAN before activating the employee.');
        return;
      }
      processedForm.nationalIdOrIqama = iqama;
      processedForm.bankIban = iban;
      processedForm.status = 'ACTIVE';
    }`,
  'activation validation',
);

source = replaceOnce(
  source,
  `            <form onSubmit={handleFormSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              
              {/* Section 1: Basic Identity */}`,
  `            <form onSubmit={handleFormSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {isCompletingOnboarding && (
                <div data-onboarding-activation className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
                  <div className="flex items-center gap-2 font-black"><UserCheck className="h-4 w-4" />{language === 'ar' ? 'استكمال بيانات الإقامة وتفعيل الموظف' : 'Complete Iqama details and activate employee'}</div>
                  <p className="mt-1 text-[11px]">{language === 'ar' ? 'أدخل رقم الإقامة الجديد والآيبان السعودي الصحيح. عند الحفظ ستتغير الحالة تلقائيًا إلى نشط.' : 'Enter the new Iqama number and a valid Saudi IBAN. Saving will automatically set the employee to Active.'}</p>
                </div>
              )}
              
              {/* Section 1: Basic Identity */}`,
  'activation guidance',
);

source = replaceOnce(
  source,
  `                      <option value="ACTIVE">{language === 'ar' ? 'على رأس العمل' : 'Active'}</option>`,
  `                      <option value="ONBOARDING">{language === 'ar' ? 'تحت الاستكمال — رقم حدود' : 'Onboarding — border number'}</option>
                      <option value="ACTIVE">{language === 'ar' ? 'على رأس العمل' : 'Active'}</option>`,
  'onboarding status option',
);

source = replaceOnce(
  source,
  `                        {/* Edit */}
                        <button`,
  `                        {emp.status === 'ONBOARDING' && (
                          <button
                            type="button"
                            onClick={() => handleCompleteOnboarding(emp)}
                            title={language === 'ar' ? 'إدخال رقم الإقامة والآيبان وتحويل الموظف إلى نشط' : 'Enter Iqama and IBAN, then activate'}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 hover:bg-emerald-100"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>{language === 'ar' ? 'استكمال وتفعيل' : 'Complete & activate'}</span>
                          </button>
                        )}

                        {/* Edit */}
                        <button`,
  'activation row action',
);

source = replaceOnce(
  source,
  `                  {editingEmployee
                    ? (language === 'ar' ? 'حفظ التعديلات' : 'Save changes')
                    : (language === 'ar' ? 'إضافة الموظف الآن' : 'Add employee')}`,
  `                  {isCompletingOnboarding
                    ? (language === 'ar' ? 'حفظ وتفعيل الموظف' : 'Save and activate employee')
                    : editingEmployee
                      ? (language === 'ar' ? 'حفظ التعديلات' : 'Save changes')
                      : (language === 'ar' ? 'إضافة الموظف الآن' : 'Add employee')}`,
  'activation submit label',
);

fs.writeFileSync(viewUrl, source);
console.log('Onboarding employee completion and activation flow applied.');
