import fs from 'node:fs';

const path = 'src/components/EmployeesView.tsx';
let source = fs.readFileSync(path, 'utf8');

const replacements = [
  ["    nationality: 'SAUDI',", "    nationality: '' as any,"],
  ["    country: 'المملكة العربية السعودية',", "    country: '',"],
  ["    department: 'تقنية المعلومات',", "    department: '',"],
  ["    hireDate: '2026-01-01',", "    hireDate: '',"],
  ["    salaryStartDate: '2026-01-01',", "    salaryStartDate: '',"],
  ["    status: 'ACTIVE',", "    status: '' as any,"],
  ["    gosiEnabled: true,", "    gosiEnabled: false,"],
  ["      baseSalary: 6000,", "      baseSalary: 0,"],
  ["      housingAllowance: 1500,", "      housingAllowance: 0,"],
  ["      transportAllowance: 600,", "      transportAllowance: 0,"],
];
for (const [before, after] of replacements) source = source.replace(before, after);

// The add form must start completely clean: no fabricated identity, job, dates, salary or nationality.
source = source.replace("      employeeNo: `${isComp1 ? 'EMP' : 'LOG'}-${1000 + nextNum}`,", "      employeeNo: '',");
source = source.replace("      nationality: 'SAUDI',", "      nationality: '' as any,");
source = source.replace("      country: 'المملكة العربية السعودية',", "      country: '',");
source = source.replace("      department: departments[0] || 'الموارد البشرية',", "      department: '',");
source = source.replace("      jobTitle: 'أخصائي شؤون إدارية',", "      jobTitle: '',");
source = source.replace("      costCenterId: company.costCenters[0]?.id || '',", "      costCenterId: '',");
source = source.replace("      hireDate: today,", "      hireDate: '',");
source = source.replace("      salaryStartDate: today,", "      salaryStartDate: '',");
source = source.replace("      status: 'ACTIVE',", "      status: '' as any,");
source = source.replace("      gosiEnabled: true,", "      gosiEnabled: false,");
source = source.replace("        baseSalary: 7000,", "        baseSalary: 0,");
source = source.replace("        housingAllowance: 1750,", "        housingAllowance: 0,");
source = source.replace("        transportAllowance: 700,", "        transportAllowance: 0,");

// Remove now-unused generated defaults helpers if present.
source = source.replace("    const nextNum = companyEmployees.length + 1;\n", '');
source = source.replace("    const isComp1 = company.id === 'comp-1';\n", '');
source = source.replace("    const today = new Date().toISOString().slice(0, 10);\n", '');

// IBAN is optional during onboarding. Validate it only when the user actually entered one.
const submitAnchor = "    // Standardize SWIFT code uppercase\n    const processedForm = {";
if (!source.includes(submitAnchor)) throw new Error('Employee submit anchor not found');
const bankLogic = `    const normalizedIban = String(formData.bankIban || '').replace(/\\s/g, '').toUpperCase();\n    if (normalizedIban && !validateSaudiIBAN(normalizedIban)) {\n      alert(language === 'ar' ? 'رقم IBAN المدخل غير صحيح. اتركه فارغًا إذا لم يصدر الحساب البنكي بعد.' : 'The entered IBAN is invalid. Leave it empty if the bank account has not been issued yet.');\n      return;\n    }\n    const hasBankAccount = Boolean(normalizedIban) && validateSaudiIBAN(normalizedIban);\n    const hasIqama = formData.nationality !== 'NON_SAUDI' || Boolean(formData.iqamaExpiryDate);\n    const derivedOnboardingStatus = formData.nationality === 'NON_SAUDI' && !hasIqama\n      ? 'WAITING_IQAMA' as const\n      : !hasBankAccount ? 'WAITING_BANK' as const : 'COMPLETE' as const;\n\n`;
if (!source.includes('const normalizedIban =')) source = source.replace(submitAnchor, bankLogic + submitAnchor);

const processedAnchor = "      ...formData,\n      employmentEndReason:";
if (!source.includes(processedAnchor) && !source.includes('bankAccountStatus: hasBankAccount')) throw new Error('Processed employee anchor not found');
source = source.replace(processedAnchor, `      ...formData,\n      iqamaIssueStatus: formData.nationality === 'NON_SAUDI' && hasIqama ? 'ISSUED' as const : 'PENDING' as const,\n      bankAccountStatus: hasBankAccount ? 'READY' as const : 'PENDING' as const,\n      onboardingStatus: derivedOnboardingStatus,\n      status: derivedOnboardingStatus !== 'COMPLETE' ? 'ONBOARDING' as const : ((formData.status || 'ACTIVE') as any),\n      bankIban: normalizedIban,\n      employmentEndReason:`);

fs.writeFileSync(path, source);
console.log('Employee onboarding corrections applied: blank defaults and optional IBAN.');
