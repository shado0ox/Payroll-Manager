import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const schema=fs.readFileSync('server/database-schema.mjs','utf8');
const registration=fs.readFileSync('server/routes/auth-registration-routes.mjs','utf8');
const routes=fs.readFileSync('server/routes/user-routes.mjs','utf8');
const state=fs.readFileSync('server/routes/state-routes.mjs','utf8');
const mainView=fs.readFileSync('src/components/UserManagementView.tsx','utf8');
const companyView=fs.readFileSync('src/components/company/CompanyUsersTab.tsx','utf8');

test('new registrations mark the company principal user as protected',()=>{
  assert.match(schema,/ADD COLUMN IF NOT EXISTS is_company_owner boolean NOT NULL DEFAULT false/);
  assert.match(registration,/email_verified_at,is_company_owner/);
  assert.match(registration,/true,now\(\),true\)/);
});

test('existing companies backfill their oldest company manager as owner',()=>{
  assert.match(schema,/SELECT DISTINCT ON \(company\.id\) candidate\.id/);
  assert.match(schema,/candidate\.role='COMPANY_MANAGER'/);
  assert.match(schema,/ORDER BY company\.id,candidate\.created_at,candidate\.id/);
});

test('company owner deletion is rejected server-side and hidden in both user screens',()=>{
  assert.match(routes,/COMPANY_OWNER_IMMUTABLE/);
  assert.match(routes,/SELECT is_company_owner[\s\S]+FOR UPDATE/);
  assert.match(state,/isCompanyOwner:user\.is_company_owner/);
  assert.match(mainView,/!isProtectedOwner/);
  assert.match(companyView,/!u\.isCompanyOwner/);
});
