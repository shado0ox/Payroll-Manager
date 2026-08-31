import fs from 'node:fs';

const path = 'src/components/EmployeesView.tsx';
let source = fs.readFileSync(path, 'utf8');

// Existing employees may predate lifecycle fields. Do not block unrelated edits while
// those records are progressively completed. New employees still require lifecycle data.
source = source.replace(
  `    if (formData.nationality === 'NON_SAUDI') {\n      if (!formData.iqamaExpiryDate && !formData.entryDate) {`,
  `    if (!editingEmployee && formData.nationality === 'NON_SAUDI') {\n      if (!formData.iqamaExpiryDate && !formData.entryDate) {`
);
source = source.replace(
  `    if (formData.nationality === 'SAUDI' && !formData.contractEndDate) {`,
  `    if (!editingEmployee && formData.nationality === 'SAUDI' && !formData.contractEndDate) {`
);

const statusBefore = `      status: derivedOnboardingStatus !== 'COMPLETE' ? 'ONBOARDING' as const : (formData.status === 'ONBOARDING' ? 'ACTIVE' as const : (formData.status || 'ACTIVE')),`;
const statusAfter = `      status: editingEmployee\n        ? (formData.status === 'ONBOARDING'\n            ? (derivedOnboardingStatus === 'COMPLETE' ? 'ACTIVE' as const : 'ONBOARDING' as const)\n            : (formData.status || 'ACTIVE'))\n        : (derivedOnboardingStatus !== 'COMPLETE' ? 'ONBOARDING' as const : (formData.status || 'ACTIVE')),`;
if (!source.includes(statusBefore) && !source.includes('status: editingEmployee')) {
  throw new Error('Legacy lifecycle status compatibility anchor not found');
}
source = source.replace(statusBefore, statusAfter);

fs.writeFileSync(path, source);
console.log('Legacy employee lifecycle progressive-migration compatibility applied.');
