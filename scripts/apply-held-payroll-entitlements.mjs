import fs from 'node:fs';

const path = 'src/components/PayrollRunsView.tsx';
let source = fs.readFileSync(path, 'utf8');

// Keep this transform tolerant of explanatory comments inside the useMemo body.
// The only legacy behavior that must be removed is the cross-period fallback.
source = source.replace(
  `return companyRuns.find(r => r.periodMonth === selectedPeriod) || companyRuns[0];`,
  `return companyRuns.find(r => r.periodMonth === selectedPeriod);`
);
if (!source.includes(`return companyRuns.find(r => r.periodMonth === selectedPeriod);`)) {
  throw new Error('Selected payroll run anchor not found');
}

const previousStatusAnchor = `        const previousEntitlementStatus = previousItem?.entitlementStatus || 'PAYABLE';\n        const shouldApplyAutomaticHold = calculated.isSuspended && previousEntitlementStatus === 'PAYABLE';`;
const previousStatusReplacement = `        const previousEntitlementStatus = previousItem?.entitlementStatus || 'PAYABLE';\n        const normalizedIban = String(emp.bankIban || '').replace(/\\s/g, '').toUpperCase();\n        const hasReadyBankAccount = /^SA\\d{22}$/.test(normalizedIban) && emp.bankAccountStatus !== 'PENDING';\n        const missingBankHold = !hasReadyBankAccount && previousEntitlementStatus === 'PAYABLE';\n        const suspensionHold = calculated.isSuspended && previousEntitlementStatus === 'PAYABLE';\n        const shouldApplyAutomaticHold = missingBankHold || suspensionHold;\n        const automaticHoldReason = missingBankHold\n          ? 'MISSING_BANK_ACCOUNT'\n          : (emp.suspensionReason?.trim() || tr('تعليق تلقائي من ملف الموظف', 'Automatically held from employee profile'));`;
if (!source.includes(previousStatusAnchor) && !source.includes('const missingBankHold = !hasReadyBankAccount')) throw new Error('Payroll automatic hold anchor not found');
source = source.replace(previousStatusAnchor, previousStatusReplacement);

source = source.replace(
`          entitlementReason: shouldApplyAutomaticHold\n            ? (emp.suspensionReason?.trim() || tr('تعليق تلقائي من ملف الموظف', 'Automatically held from employee profile'))\n            : previousItem.entitlementReason,`,
`          entitlementReason: shouldApplyAutomaticHold\n            ? automaticHoldReason\n            : previousItem.entitlementReason,`
);

const newItemOld = `        } : calculated.isSuspended ? {\n          ...calculated,\n          entitlementStatus: 'HELD',\n          entitlementReason: emp.suspensionReason?.trim() || tr('تعليق تلقائي من ملف الموظف', 'Automatically held from employee profile'),\n          entitlementUpdatedAt: new Date().toISOString(),\n        } : calculated;`;
const newItemNew = `        } : (!hasReadyBankAccount || calculated.isSuspended) ? {\n          ...calculated,\n          entitlementStatus: 'HELD',\n          entitlementReason: !hasReadyBankAccount\n            ? 'MISSING_BANK_ACCOUNT'\n            : (emp.suspensionReason?.trim() || tr('تعليق تلقائي من ملف الموظف', 'Automatically held from employee profile')),\n          entitlementUpdatedAt: new Date().toISOString(),\n        } : calculated;`;
if (!source.includes(newItemOld) && !source.includes(`} : (!hasReadyBankAccount || calculated.isSuspended) ? {`)) throw new Error('New payroll item hold anchor not found');
source = source.replace(newItemOld, newItemNew);

const statusChangeAnchor = `  const handleEntitlementStatusChange = (item: PayrollRunItem, status: PayrollEntitlementStatus) => {\n    if (!currentRun) return;`;
const statusChangeReplacement = `  const handleEntitlementStatusChange = (item: PayrollRunItem, status: PayrollEntitlementStatus) => {\n    if (!currentRun) return;\n    if (status === 'PAYABLE' && item.entitlementReason === 'MISSING_BANK_ACCOUNT') {\n      const employee = companyEmployees.find(emp => emp.id === item.employeeId);\n      const normalizedIban = String(employee?.bankIban || '').replace(/\\s/g, '').toUpperCase();\n      const bankReady = /^SA\\d{22}$/.test(normalizedIban) && employee?.bankAccountStatus !== 'PENDING';\n      if (!bankReady) {\n        alert(tr('لا يمكن تحرير الراتب المعلق قبل اكتمال IBAN السعودي وتأكيد جاهزية الحساب البنكي في ملف الموظف.', 'The held salary cannot be released until a valid Saudi IBAN is saved and the bank account is marked ready.'));\n        return;\n      }\n    }`;
if (!source.includes(statusChangeAnchor) && !source.includes(`status === 'PAYABLE' && item.entitlementReason === 'MISSING_BANK_ACCOUNT'`)) throw new Error('Entitlement release guard anchor not found');
source = source.replace(statusChangeAnchor, statusChangeReplacement);

const ibanExportGuard = `    if (!stillEligible.length) return;`;
const ibanExportReplacement = `    if (!stillEligible.length) return;\n    const invalidBankItems = stillEligible.filter(item => {\n      const employee = companyEmployees.find(emp => emp.id === item.employeeId);\n      const iban = String(employee?.bankIban || item.bankIban || '').replace(/\\s/g, '').toUpperCase();\n      return !/^SA\\d{22}$/.test(iban) || employee?.bankAccountStatus === 'PENDING';\n    });\n    if (paymentBatchForm.method !== 'CASH' && invalidBankItems.length) {\n      alert(tr('لا يمكن إنشاء دفعة بنكية: يوجد موظفون بدون IBAN سعودي مكتمل أو حساب بنكي جاهز.', 'Bank batch cannot be created: some employees do not have a valid Saudi IBAN or a ready bank account.'));\n      return;\n    }`;
if (!source.includes(ibanExportGuard) && !source.includes('const invalidBankItems = stillEligible.filter')) throw new Error('Payment batch bank guard anchor not found');
source = source.replace(ibanExportGuard, ibanExportReplacement);

fs.writeFileSync(path, source);
console.log('Missing-IBAN payroll hold and safe release workflow applied.');
