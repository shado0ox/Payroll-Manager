import fs from 'node:fs';

const path = 'src/components/EmployeesView.tsx';
let source = fs.readFileSync(path, 'utf8');

const processedStart = source.indexOf('    const processedForm = {');
const processedEnd = source.indexOf('\n    };', processedStart);
if (processedStart < 0 || processedEnd < 0) {
  throw new Error('Processed employee form block not found');
}

let block = source.slice(processedStart, processedEnd);
if (!block.includes('nationalIdOrIqama: normalizedIdentity,')) {
  throw new Error('Guided onboarding normalized identity property not found');
}

const legacyIdentityLine = "      nationalIdOrIqama: formData.nationality === 'NON_SAUDI' && formData.iqamaNumber?.trim() ? formData.iqamaNumber.trim() : (formData.nationalIdOrIqama || ''),\n";
block = block.replace(legacyIdentityLine, '');

const identityMatches = block.match(/\n\s*nationalIdOrIqama:/g) || [];
if (identityMatches.length !== 1) {
  throw new Error(`Expected exactly one processed nationalIdOrIqama property, found ${identityMatches.length}`);
}

source = source.slice(0, processedStart) + block + source.slice(processedEnd);
fs.writeFileSync(path, source);
console.log('Employee add wizard duplicate identity property removed.');
