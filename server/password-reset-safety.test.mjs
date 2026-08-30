import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');

test('startup checks for duplicate user emails before creating the unique email index', () => {
  assert.match(server, /duplicateUserEmails/);
  assert.match(server, /GROUP BY lower\(email\) HAVING count\(\*\) > 1/);
  assert.match(server, /if \(!duplicateUserEmails\.rowCount\)[\s\S]*users_email_ci_unique/);
});

test('user writes reject duplicate emails case-insensitively with a dedicated error', () => {
  assert.match(server, /const normalizedEmail = String\(u\.email \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(server, /lower\(email\)=lower\(\$1\) AND id<>\$2/);
  assert.match(server, /USER_EMAIL_EXISTS/);
});
