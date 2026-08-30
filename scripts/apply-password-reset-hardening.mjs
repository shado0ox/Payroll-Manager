import fs from 'node:fs';

const serverUrl = new URL('../server/index.mjs', import.meta.url);
const loginUrl = new URL('../src/components/LoginView.tsx', import.meta.url);
const apiUrl = new URL('../src/utils/api.ts', import.meta.url);

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing transform anchor: ${label}`);
  return source.replace(before, after);
}

// Backend password reset flow. This is intentionally implemented as a deterministic
// build transform until server/index.mjs is split into smaller route modules.
{
  let source = fs.readFileSync(serverUrl, 'utf8');

  source = replaceOnce(
    source,
    `  await pool.query(\`CREATE TABLE IF NOT EXISTS \${q('sessions')} (`,
    `  await pool.query(\`CREATE TABLE IF NOT EXISTS \${q('password_reset_tokens')} (\n    id text PRIMARY KEY, user_id text NOT NULL REFERENCES \${q('users')}(id) ON DELETE CASCADE,\n    token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()\n  )\`);\n  await pool.query(\`CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON \${q('password_reset_tokens')}(user_id,expires_at)\`);\n  await pool.query(\`CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci_unique ON \${q('users')} (lower(email)) WHERE email IS NOT NULL AND btrim(email) <> ''\`);\n\n  await pool.query(\`CREATE TABLE IF NOT EXISTS \${q('sessions')} (`,
    'password reset tables'
  );

  const loginAnchor = `app.post('/api/auth/login', loginLimiter, async (req, res, next) => {`;
  if (!source.includes(loginAnchor)) throw new Error('Missing transform anchor: login route');

  const resetRoutes = `app.post('/api/auth/password-reset/request', loginLimiter, async (req, res, next) => {\n  try {\n    const email = String(req.body?.email || '').trim().toLowerCase();\n    // Always return the same response to avoid account enumeration.\n    const accepted = () => res.json({ ok:true, message:'PASSWORD_RESET_REQUEST_ACCEPTED' });\n    if (!email || !email.includes('@')) return accepted();\n    const r = await pool.query(\`SELECT id,email,name FROM \${q('users')} WHERE lower(email)=lower($1) AND is_active=true LIMIT 1\`, [email]);\n    if (!r.rowCount) return accepted();\n    const user = r.rows[0];\n    const token = crypto.randomBytes(32).toString('base64url');\n    const tokenHash = sha256(token);\n    await pool.query(\`DELETE FROM \${q('password_reset_tokens')} WHERE user_id=$1 OR expires_at <= now() OR used_at IS NOT NULL\`, [user.id]);\n    await pool.query(\`INSERT INTO \${q('password_reset_tokens')} (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,now()+interval '30 minutes')\`, [\`reset-\${crypto.randomUUID()}\`, user.id, tokenHash]);\n    const origin = String(process.env.APP_ORIGIN || '').replace(/\\/$/, '');\n    const resetUrl = \`\${origin}/?reset_token=\${encodeURIComponent(token)}\`;\n    if (resendApiKey && verificationEmailFrom && origin) {\n      try {\n        await fetch('https://api.resend.com/emails', {\n          method:'POST',\n          headers:{ Authorization:\`Bearer \${resendApiKey}\`, 'Content-Type':'application/json' },\n          body:JSON.stringify({\n            from:verificationEmailFrom,\n            to:[user.email],\n            subject:'Masar Payroll - Password reset',\n            html:\`<p>مرحبًا \${String(user.name || '').replace(/[<>&\"']/g,'')}</p><p>تم طلب إعادة تعيين كلمة المرور لحسابك في مسار.</p><p><a href="\${resetUrl}">إعادة تعيين كلمة المرور</a></p><p>الرابط صالح لمدة 30 دقيقة ولمرة واحدة فقط.</p>\`,\n          }),\n        });\n      } catch {}\n    }\n    return accepted();\n  } catch (e) { next(e); }\n});\n\napp.post('/api/auth/password-reset/confirm', loginLimiter, async (req, res, next) => {\n  const client = await pool.connect();\n  try {\n    const token = String(req.body?.token || '');\n    const password = String(req.body?.password || '');\n    if (!token || !isStrongPassword(password)) return res.status(400).json({ error:'INVALID_PASSWORD_RESET' });\n    await client.query('BEGIN');\n    const r = await client.query(\`SELECT id,user_id FROM \${q('password_reset_tokens')} WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() FOR UPDATE\`, [sha256(token)]);\n    if (!r.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({ error:'PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED' }); }\n    const row = r.rows[0];\n    const passwordHash = await bcrypt.hash(password, 12);\n    await client.query(\`UPDATE \${q('users')} SET password_hash=$1,updated_at=now() WHERE id=$2\`, [passwordHash,row.user_id]);\n    await client.query(\`UPDATE \${q('password_reset_tokens')} SET used_at=now() WHERE id=$1\`, [row.id]);\n    await client.query(\`DELETE FROM \${q('sessions')} WHERE user_id=$1\`, [row.user_id]);\n    await client.query('COMMIT');\n    res.json({ ok:true });\n  } catch (e) { try { await client.query('ROLLBACK'); } catch {} next(e); } finally { client.release(); }\n});\n\n`;
  source = source.replace(loginAnchor, resetRoutes + loginAnchor);
  fs.writeFileSync(serverUrl, source);
}

// Client API helpers.
{
  let source = fs.readFileSync(apiUrl, 'utf8');
  source = replaceOnce(
    source,
    `  login: (companyCode: string, username: string, password: string) => request<{user: UserAccount; companyId: string}>('/api/auth/login', { method:'POST', body:JSON.stringify({ companyCode, username, password }) }),`,
    `  passwordResetRequest: (email: string) => request<{ok:boolean;message:string}>('/api/auth/password-reset/request', { method:'POST', body:JSON.stringify({ email }) }),\n  passwordResetConfirm: (token: string, password: string) => request<{ok:boolean}>('/api/auth/password-reset/confirm', { method:'POST', body:JSON.stringify({ token, password }) }),\n  login: (companyCode: string, username: string, password: string) => request<{user: UserAccount; companyId: string}>('/api/auth/login', { method:'POST', body:JSON.stringify({ companyCode, username, password }) }),`,
    'password reset API helpers'
  );
  fs.writeFileSync(apiUrl, source);
}

// Login UI: add a compact forgot-password/reset panel without changing the normal login flow.
{
  let source = fs.readFileSync(loginUrl, 'utf8');
  source = replaceOnce(
    source,
    `import { useLanguage } from '../i18n/LanguageContext';`,
    `import { useLanguage } from '../i18n/LanguageContext';\nimport { api } from '../utils/api';\nimport { isStrongPassword, passwordPolicyMessage } from '../utils/passwordPolicy';`,
    'login imports'
  );

  const componentAnchor = `export const LoginView: React.FC<LoginViewProps> = (`;
  if (!source.includes(componentAnchor)) throw new Error('Missing transform anchor: LoginView declaration');

  // Insert state immediately after the language hook when present.
  const languageAnchor = `  const { language } = useLanguage();`;
  source = replaceOnce(source, languageAnchor, `${languageAnchor}\n  const [forgotOpen, setForgotOpen] = useState(false);\n  const [forgotEmail, setForgotEmail] = useState('');\n  const [forgotMessage, setForgotMessage] = useState('');\n  const [resetPassword, setResetPassword] = useState('');\n  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');\n  const [resetBusy, setResetBusy] = useState(false);\n  const resetToken = new URLSearchParams(window.location.search).get('reset_token') || '';\n\n  const passwordResetRequest = async () => {\n    if (!forgotEmail.trim()) return;\n    setResetBusy(true);\n    try {\n      await api.passwordResetRequest(forgotEmail.trim());\n      setForgotMessage(language === 'ar' ? 'إذا كان البريد مسجلًا، تم إرسال رابط إعادة تعيين كلمة المرور.' : 'If the email is registered, a password reset link has been sent.');\n    } catch {\n      setForgotMessage(language === 'ar' ? 'تعذر إرسال الطلب الآن. حاول مرة أخرى.' : 'Could not submit the request. Please try again.');\n    } finally { setResetBusy(false); }\n  };\n\n  const passwordResetConfirm = async () => {\n    if (!resetToken || resetPassword !== resetPasswordConfirm || !isStrongPassword(resetPassword)) {\n      setForgotMessage(language === 'ar' ? (resetPassword !== resetPasswordConfirm ? 'كلمتا المرور غير متطابقتين.' : passwordPolicyMessage) : 'Passwords must match and meet the password policy.');\n      return;\n    }\n    setResetBusy(true);\n    try {\n      await api.passwordResetConfirm(resetToken, resetPassword);\n      window.history.replaceState({}, '', window.location.pathname);\n      setForgotMessage(language === 'ar' ? 'تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن.' : 'Password changed. You can sign in now.');\n      setResetPassword(''); setResetPasswordConfirm('');\n    } catch {\n      setForgotMessage(language === 'ar' ? 'الرابط غير صالح أو منتهي. اطلب رابطًا جديدًا.' : 'The link is invalid or expired. Request a new link.');\n    } finally { setResetBusy(false); }\n  };`, 'login reset state');

  const formClose = `</form>`;
  const panel = `{resetToken ? (\n          <div className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 space-y-3">\n            <div className="text-sm font-bold text-slate-800">{language === 'ar' ? 'تعيين كلمة مرور جديدة' : 'Set a new password'}</div>\n            <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder={language === 'ar' ? 'كلمة المرور الجديدة' : 'New password'} className="w-full px-3 py-2 rounded-lg border border-slate-200" />\n            <input type="password" value={resetPasswordConfirm} onChange={e => setResetPasswordConfirm(e.target.value)} placeholder={language === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm password'} className="w-full px-3 py-2 rounded-lg border border-slate-200" />\n            <button type="button" disabled={resetBusy} onClick={passwordResetConfirm} className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white font-bold disabled:opacity-50">{language === 'ar' ? 'حفظ كلمة المرور الجديدة' : 'Save new password'}</button>\n            {forgotMessage && <p className="text-xs text-slate-600">{forgotMessage}</p>}\n          </div>\n        ) : (\n          <div className="mt-3">\n            <button type="button" onClick={() => setForgotOpen(v => !v)} className="text-xs font-bold text-emerald-700 hover:text-emerald-800">{language === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot password?'}</button>\n            {forgotOpen && <div className="mt-3 rounded-xl border border-slate-200 bg-white/90 p-3 space-y-2">\n              <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder={language === 'ar' ? 'البريد الإلكتروني المسجل' : 'Registered email'} className="w-full px-3 py-2 rounded-lg border border-slate-200" />\n              <button type="button" disabled={resetBusy || !forgotEmail.trim()} onClick={passwordResetRequest} className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white font-bold disabled:opacity-50">{language === 'ar' ? 'إرسال رابط إعادة التعيين' : 'Send reset link'}</button>\n              {forgotMessage && <p className="text-xs text-slate-600">{forgotMessage}</p>}\n            </div>}\n          </div>\n        )}`;
  source = replaceOnce(source, formClose, `${formClose}\n        ${panel}`, 'forgot password panel');
  fs.writeFileSync(loginUrl, source);
}

console.log('Password reset hardening transform applied.');
