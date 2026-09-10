import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const passwordResetRoutes = fs.readFileSync(new URL('./routes/auth-password-reset-routes.mjs', import.meta.url), 'utf8');
const passwordResetServer = [server,passwordResetRoutes].join('\n');
const login = fs.readFileSync(new URL('../src/components/LoginView.tsx', import.meta.url), 'utf8');
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
