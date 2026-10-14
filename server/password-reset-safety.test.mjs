import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = [
  fs.readFileSync(new URL('./database-schema.mjs', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('./tenant-credentials.mjs', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('./user-record-policy.mjs', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('./routes/user-routes.mjs', import.meta.url), 'utf8'),
].join('\n');

test('startup checks tenant credential collisions before removing global uniqueness', () => {
  assert.match(server, /GROUP BY company_id,identifier HAVING count\(DISTINCT account_group\)>1/);
  assert.match(server, /TENANT_CREDENTIAL_COLLISION/);
  assert.match(server, /PRIMARY KEY\(company_id,identifier\)/);
});

test('user writes reject duplicate emails case-insensitively with a dedicated error', () => {
  assert.match(server, /const normalizedEmail = String\(user\.email \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(server, /lower\(email\)=lower\(\$1\) AND id<>\$2/);
  assert.match(server, /USER_EMAIL_EXISTS/);
});
