import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const passwordResetRoutes = fs.readFileSync(new URL('./routes/auth-password-reset-routes.mjs', import.meta.url), 'utf8');
const passwordResetServer = [server,passwordResetRoutes].join('\n');
const loginRoutes = fs.readFileSync(new URL('./routes/auth-login-routes.mjs', import.meta.url), 'utf8');
const login = fs.readFileSync(new URL('../src/components/LoginView.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/utils/api.ts', import.meta.url), 'utf8');
const users = fs.readFileSync(new URL('../src/components/UserManagementView.tsx', import.meta.url), 'utf8');

test('password reset API is exposed without account enumeration', () => {
  assert.match(passwordResetServer, /password-reset\/request/);
  assert.match(passwordResetServer, /password-reset\/confirm/);
  assert.match(passwordResetServer, /PASSWORD_RESET_REQUEST_ACCEPTED/);
});

test('reset tokens are hashed, expiring, single use, and sessions are revoked', () => {
  assert.match(passwordResetServer, /password_reset_tokens/);
  assert.match(passwordResetServer, /token_hash/);
  assert.match(passwordResetServer, /expires_at/);
  assert.match(passwordResetServer, /used_at/);
  assert.match(passwordResetServer, /DELETE FROM .*sessions.*user_id/si);
});

test('login page exposes forgot password flow', () => {
  assert.match(login, /نسيت كلمة المرور/);
  assert.match(login, /passwordResetRequest/);
  assert.match(login, /passwordResetConfirm/);
});

test('login accepts either username or email inside the selected company', () => {
  assert.match(loginRoutes, /lower\(u\.username\)=\$1 OR lower\(u\.email\)=\$1/);
  assert.match(loginRoutes, /c\.company_code=\$2 AND c\.is_archived=false/);
  assert.match(login, /اسم المستخدم أو البريد الإلكتروني/);
});

test('username recovery uses email only and does not enumerate accounts', () => {
  assert.match(passwordResetRoutes, /username-recovery\/request/);
  assert.match(passwordResetRoutes, /USERNAME_RECOVERY_REQUEST_ACCEPTED/);
  assert.match(passwordResetRoutes, /WHERE lower\(email\)=lower\(\$1\) AND is_active=true LIMIT 1/);
  assert.match(passwordResetRoutes, /escapeHtml\(user\.username\)/);
  assert.match(api, /usernameRecoveryRequest/);
  assert.match(login, /نسيت اسم المستخدم/);
});

test('company code recovery emails all active assigned companies without exposing them in the response', () => {
  assert.match(passwordResetRoutes, /company-code-recovery\/request/);
  assert.match(passwordResetRoutes, /COMPANY_CODE_RECOVERY_REQUEST_ACCEPTED/);
  assert.match(passwordResetRoutes, /JOIN .*companies.* ON u\.company_ids \? c\.id/s);
  assert.match(passwordResetRoutes, /c\.is_archived=false/);
  assert.match(passwordResetRoutes, /result\.rows\.map\(company/);
  assert.match(api, /companyCodeRecoveryRequest/);
  assert.match(login, /نسيت رمز المنشأة/);
});

test('editing a user never reuses or exposes their existing password', () => {
  assert.doesNotMatch(users, /password:\s*user\.password/);
  assert.match(users, /password:\s*editingUser \? '' : formData\.password/);
  assert.match(users, /!editingUser && <div>/);
  assert.match(users, /تعديل بيانات المستخدم والصلاحيات/);
});

test('new-user form does not suggest or autofill administrator credentials', () => {
  assert.match(users, /placeholder=\{language === 'ar' \? 'أدخل اسم مستخدم جديد' : 'Enter a new username'\}/);
  assert.match(users, /name="new-user-username"/);
  assert.match(users, /autoComplete="off"/);
  assert.match(users, /placeholder=\{language === 'ar' \? 'أنشئ كلمة مرور جديدة' : 'Create a new password'\}/);
  assert.match(users, /name="new-user-password"/);
  assert.match(users, /autoComplete="new-password"/);
});
