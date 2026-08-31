import fs from 'node:fs';

const path = 'server/index.mjs';
const source = fs.readFileSync(path, 'utf8');
const start = source.indexOf('const HR_DAY_MS = 86400000;');
const end = source.indexOf("async function sendVerificationEmail(email, code, language = 'ar') {");
if (start < 0 || end < 0 || end <= start) throw new Error('HR lifecycle email generated block not found');
const block = source.slice(start, end)
  .replace(/\\`/g, '`')
  .replace(/\\\$\{/g, '${');
const next = source.slice(0, start) + block + source.slice(end);
if (next !== source) fs.writeFileSync(path, next);
console.log('HR lifecycle generated email syntax fixed.');
