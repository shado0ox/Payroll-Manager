import fs from 'node:fs';

const path = 'src/components/EmployeesView.tsx';
let source = fs.readFileSync(path, 'utf8');

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
if (ibanInputStart < 0) throw new Error('Employee IBAN input not found after update');
const nearby = source.slice(Math.max(0, ibanInputStart - 120), ibanInputStart + 120);
if (/\brequired\b/.test(nearby)) {
  throw new Error('Employee IBAN input is still marked required');
}

fs.writeFileSync(path, source);
console.log('Employee IBAN is optional at registration; transfer-stage validation remains unchanged.');
