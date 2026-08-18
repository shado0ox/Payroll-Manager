import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;
const port = Number(process.env.PORT || 3000);
const schema = process.env.DB_SCHEMA || 'masar_payroll';
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('DB_SCHEMA is invalid');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) {
  throw new Error('ADMIN_PASSWORD must be at least 12 characters');
}
for (const key of ['ADMIN_USERNAME', 'ADMIN_NAME', 'COMPANY_ID', 'COMPANY_CODE', 'COMPANY_NAME_AR', 'COMPANY_NAME_EN']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
});

const q = (name) => `"${schema}".${name}`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const cookieValue = (req, key) => (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${key}=`))?.slice(key.length + 1);

async function migrate() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('companies')} (
    id text PRIMARY KEY, company_code text NOT NULL UNIQUE, name_ar text NOT NULL, name_en text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('users')} (
    id text PRIMARY KEY, username text NOT NULL UNIQUE, password_hash text NOT NULL, name text NOT NULL,
    email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', role text NOT NULL,
    company_ids jsonb NOT NULL DEFAULT '[]', is_active boolean NOT NULL DEFAULT true,
    last_login timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('sessions')} (
    token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES ${q('users')}(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('app_state')} (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1), state jsonb NOT NULL DEFAULT '{}',
    version bigint NOT NULL DEFAULT 1, updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('audit_log')} (
    id bigserial PRIMARY KEY, user_id text, action text NOT NULL, ip inet, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON ${q('sessions')}(expires_at)`);

  const companyId = process.env.COMPANY_ID;
  await pool.query(`INSERT INTO ${q('companies')} (id, company_code, name_ar, name_en) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`, [
    companyId, process.env.COMPANY_CODE, process.env.COMPANY_NAME_AR, process.env.COMPANY_NAME_EN
  ]);
  const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  await pool.query(`INSERT INTO ${q('users')} (id, username, password_hash, name, email, role, company_ids)
    VALUES ('user-admin',$1,$2,$3,$4,'ADMIN',$5::jsonb) ON CONFLICT (username) DO NOTHING`, [
    process.env.ADMIN_USERNAME, adminHash, process.env.ADMIN_NAME, process.env.ADMIN_EMAIL || '', JSON.stringify([companyId])
  ]);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"] } } }));
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['sec-fetch-site'] === 'cross-site') {
    return res.status(403).json({ error: 'CROSS_SITE_REQUEST_BLOCKED' });
  }
  next();
});

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });

async function auth(req, res, next) {
  try {
    const token = cookieValue(req, 'masar_session');
    if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    const result = await pool.query(`SELECT u.id,u.username,u.name,u.email,u.phone,u.role,u.company_ids,u.is_active
      FROM ${q('sessions')} s JOIN ${q('users')} u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at > now() AND u.is_active=true`, [sha256(token)]);
    if (!result.rowCount) return res.status(401).json({ error: 'SESSION_EXPIRED' });
    req.user = result.rows[0];
    next();
  } catch (error) { next(error); }
}

app.get('/api/health', async (_req, res, next) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); } catch (e) { next(e); }
});

app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const companyCode = String(req.body?.companyCode || '').trim();
    const password = String(req.body?.password || '');
    const result = await pool.query(`SELECT u.*, c.id company_id FROM ${q('users')} u
      JOIN ${q('companies')} c ON c.company_code=$2 WHERE lower(u.username)=$1`, [username, companyCode]);
    const user = result.rows[0];
    const valid = user && user.is_active && await bcrypt.compare(password, user.password_hash);
    const companyAllowed = valid && (user.role === 'ADMIN' || user.company_ids.includes(user.company_id));
    if (!companyAllowed) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    const token = crypto.randomBytes(32).toString('base64url');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM ${q('sessions')} WHERE expires_at <= now()`);
      await client.query(`INSERT INTO ${q('sessions')} (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '12 hours')`, [sha256(token), user.id]);
      await client.query(`UPDATE ${q('users')} SET last_login=now() WHERE id=$1`, [user.id]);
      await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,'LOGIN',$2)`, [user.id, req.ip]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    res.setHeader('Set-Cookie', `masar_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${process.env.COOKIE_SECURE === 'false' ? '' : '; Secure'}`);
    res.json({ user: { id:user.id, username:user.username, name:user.name, email:user.email, phone:user.phone, role:user.role, companyIds:user.company_ids, isActive:true, createdAt:user.created_at, lastLogin:new Date().toISOString() }, companyId:user.company_id });
  } catch (e) { next(e); }
});

app.post('/api/auth/logout', auth, async (req, res, next) => {
  try {
    const token = cookieValue(req, 'masar_session');
    await pool.query(`DELETE FROM ${q('sessions')} WHERE token_hash=$1`, [sha256(token)]);
    res.setHeader('Set-Cookie', 'masar_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    res.status(204).end();
  } catch (e) { next(e); }
});

app.get('/api/state', auth, async (_req, res, next) => {
  try { const r = await pool.query(`SELECT state,version,updated_at FROM ${q('app_state')} WHERE id=1`); res.json(r.rows[0] || { state:null, version:0 }); } catch (e) { next(e); }
});

app.put('/api/state', auth, writeLimiter, async (req, res, next) => {
  try {
    const state = req.body?.state;
    const expectedVersion = Number(req.body?.version || 0);
    if (!state || typeof state !== 'object' || Array.isArray(state)) return res.status(400).json({ error:'INVALID_STATE' });
    delete state.currentUser;
    if (Array.isArray(state.users)) state.users = state.users.map(({ password, ...u }) => u);
    const r = await pool.query(`INSERT INTO ${q('app_state')} (id,state,version,updated_by) VALUES (1,$1::jsonb,1,$2)
      ON CONFLICT (id) DO UPDATE SET state=EXCLUDED.state,version=${q('app_state')}.version+1,updated_by=EXCLUDED.updated_by,updated_at=now()
      WHERE ${q('app_state')}.version=$3 RETURNING version,updated_at`, [JSON.stringify(state), req.user.id, expectedVersion]);
    if (!r.rowCount) return res.status(409).json({ error:'STATE_CONFLICT_RELOAD_REQUIRED' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

app.put('/api/users/:id', auth, writeLimiter, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error:'FORBIDDEN' });
    const u = req.body || {};
    if (!u.username || !u.name || !u.role || !Array.isArray(u.companyIds)) return res.status(400).json({ error:'INVALID_USER' });
    const existing = await pool.query(`SELECT id,password_hash FROM ${q('users')} WHERE id=$1`, [req.params.id]);
    if (!existing.rowCount && (!u.password || u.password.length < 12)) return res.status(400).json({ error:'PASSWORD_TOO_SHORT' });
    const passwordHash = u.password ? await bcrypt.hash(u.password, 12) : existing.rows[0]?.password_hash;
    const r = await pool.query(`INSERT INTO ${q('users')} (id,username,password_hash,name,email,phone,role,company_ids,is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
      ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username,password_hash=EXCLUDED.password_hash,name=EXCLUDED.name,
      email=EXCLUDED.email,phone=EXCLUDED.phone,role=EXCLUDED.role,company_ids=EXCLUDED.company_ids,is_active=EXCLUDED.is_active,updated_at=now()
      RETURNING id,username,name,email,phone,role,company_ids,is_active,created_at,last_login`, [
      req.params.id, String(u.username).toLowerCase(), passwordHash, u.name, u.email || '', u.phone || '', u.role, JSON.stringify(u.companyIds), u.isActive !== false
    ]);
    const row = r.rows[0];
    res.json({ id:row.id,username:row.username,name:row.name,email:row.email,phone:row.phone,role:row.role,companyIds:row.company_ids,isActive:row.is_active,createdAt:row.created_at,lastLogin:row.last_login });
  } catch (e) { if (e?.code === '23505') return res.status(409).json({ error:'USERNAME_EXISTS' }); next(e); }
});

app.delete('/api/users/:id', auth, writeLimiter, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error:'FORBIDDEN' });
    if (req.user.id === req.params.id) return res.status(400).json({ error:'CANNOT_DELETE_SELF' });
    await pool.query(`DELETE FROM ${q('users')} WHERE id=$1`, [req.params.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
app.use(express.static(root, { index: false, maxAge: '1h', immutable: false }));
app.get('*', (_req, res) => res.sendFile(path.join(root, 'index.html')));
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'INTERNAL_ERROR' }); });

await migrate();
const server = app.listen(port, '0.0.0.0', () => console.log(`Masar Payroll listening on ${port}`));
const shutdown = async () => { server.close(); await pool.end(); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
