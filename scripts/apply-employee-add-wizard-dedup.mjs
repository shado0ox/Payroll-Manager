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

const requiredIbanBlock = `                    <input\n                      type="text"\n                      required\n                      placeholder="SAXXXXXXXXXXXXXXXXXXXXXXXX"`;
const optionalIbanBlock = `                    <input\n                      type="text"\n                      placeholder="SAXXXXXXXXXXXXXXXXXXXXXXXX"`;
if (!source.includes(requiredIbanBlock) && !source.includes(optionalIbanBlock)) {
  throw new Error('Employee IBAN input anchor not found');
}
source = source.replace(requiredIbanBlock, optionalIbanBlock);
source = source.replace(
  `{language === 'ar' ? 'رقم الآيبان (IBAN) *' : 'IBAN *'}`,
  `{language === 'ar' ? 'رقم الآيبان (IBAN) — اختياري عند التسجيل' : 'IBAN — optional at registration'}`
);

const ibanInputStart = source.indexOf('placeholder="SAXXXXXXXXXXXXXXXXXXXXXXXX"');
const ibanNearby = source.slice(Math.max(0, ibanInputStart - 120), ibanInputStart + 120);
if (ibanInputStart < 0 || /\brequired\b/.test(ibanNearby)) {
  throw new Error('Employee IBAN input is still required');
}

fs.writeFileSync(path, source);
console.log('Employee add wizard cleanup applied; IBAN remains optional at registration.');
