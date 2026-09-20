import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';

export function createAuthRegistrationRouter({
  registrationLimiter,
  publicRegistrationEnabled,
  pool,
  q,
  sha256,
  isStrongPassword,
  sendVerificationEmail,
  trialDays,
  newCompanyPayload,
  companyManagerPermissions,
}) {
  const router = express.Router();
  const employeeAccountStatuses = ['ACTIVE','SUSPENDED','ON_LEAVE'];

  router.post('/employee-register/start', registrationLimiter, async (req,res,next) => {
    try {
      const companyCode = String(req.body?.companyCode || '').trim();
      const identityNumber = String(req.body?.identityNumber || '').replace(/\s/g,'');
      const email = String(req.body?.email || '').trim().toLowerCase();
      const username = String(req.body?.username || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const language = req.body?.language === 'en' ? 'en' : 'ar';
      if (!/^[A-Za-z0-9_-]{2,30}$/.test(companyCode) || !/^[A-Za-z0-9-]{5,30}$/.test(identityNumber)
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[a-z0-9._-]{3,40}$/.test(username)
        || !isStrongPassword(password)) return res.status(400).json({ error:'INVALID_EMPLOYEE_REGISTRATION' });
      const requestId = `employee-registration-${crypto.randomUUID()}`;
      const employee = await pool.query(`SELECT e.id,e.company_id,e.status,e.first_name_ar,e.last_name_ar,e.first_name_en,e.last_name_en,e.payload
        FROM ${q('employees')} e JOIN ${q('companies')} c ON c.id=e.company_id AND c.company_code=$1 AND c.is_archived=false
        WHERE e.is_archived=false AND e.status=ANY($4::text[])
          AND (e.national_id_or_iqama=$2 OR e.payload->>'iqamaNumber'=$2)
          AND lower(COALESCE(e.payload->>'email',''))=$3 LIMIT 1`,[companyCode,identityNumber,email,employeeAccountStatuses]);
      if (!employee.rowCount) return res.status(202).json({ requestId,maskedEmail:email.replace(/^(.{1,2}).*(@.*)$/,'$1***$2'),expiresInSeconds:900 });
      const duplicate = await pool.query(`SELECT 1 FROM ${q('users')} WHERE lower(username)=$1 OR lower(email)=$2 OR employee_id=$3 LIMIT 1`,[username,email,employee.rows[0].id]);
      if (duplicate.rowCount) return res.status(409).json({ error:'EMPLOYEE_ACCOUNT_ALREADY_EXISTS' });
      const code = String(crypto.randomInt(100000,1000000));
      const row = employee.rows[0];
      const name = `${row.first_name_ar || row.first_name_en || ''} ${row.last_name_ar || row.last_name_en || ''}`.trim();
      const details = { kind:'EMPLOYEE',employeeId:row.id,companyId:row.company_id,companyCode,username,email,name,passwordHash:await bcrypt.hash(password,12),language };
      await pool.query(`INSERT INTO ${q('registration_requests')} (id,email,code_hash,details,expires_at)
        VALUES ($1,$2,$3,$4::jsonb,now()+interval '15 minutes')
        ON CONFLICT (email) DO UPDATE SET id=EXCLUDED.id,code_hash=EXCLUDED.code_hash,details=EXCLUDED.details,expires_at=EXCLUDED.expires_at,attempts=0,updated_at=now()`,
      [requestId,email,sha256(`${requestId}:${code}`),JSON.stringify(details)]);
      try { await sendVerificationEmail(email,code,language,'EMPLOYEE_REGISTRATION'); }
      catch (error) { await pool.query(`DELETE FROM ${q('registration_requests')} WHERE id=$1`,[requestId]); throw error; }
      res.status(202).json({ requestId,maskedEmail:email.replace(/^(.{1,2}).*(@.*)$/,'$1***$2'),expiresInSeconds:900 });
    } catch (error) { next(error); }
  });

  router.post('/employee-register/verify', registrationLimiter, async (req,res,next) => {
    const client = await pool.connect();
    try {
      const requestId = String(req.body?.requestId || '');
      const code = String(req.body?.code || '').trim();
      if (!requestId || !/^\d{6}$/.test(code)) return res.status(400).json({ error:'INVALID_VERIFICATION_CODE' });
      await client.query('BEGIN');
      const request = await client.query(`SELECT * FROM ${q('registration_requests')} WHERE id=$1 FOR UPDATE`,[requestId]);
      const row = request.rows[0];
      if (!row || row.details?.kind !== 'EMPLOYEE' || new Date(row.expires_at).getTime() <= Date.now() || row.attempts >= 5) {
        await client.query('ROLLBACK'); return res.status(400).json({ error:'VERIFICATION_EXPIRED' });
      }
      if (row.code_hash !== sha256(`${requestId}:${code}`)) {
        await client.query(`UPDATE ${q('registration_requests')} SET attempts=attempts+1,updated_at=now() WHERE id=$1`,[requestId]);
        await client.query('COMMIT'); return res.status(400).json({ error:'INVALID_VERIFICATION_CODE' });
      }
      const details = row.details;
      const employee = await client.query(`SELECT id,status FROM ${q('employees')} WHERE id=$1 AND company_id=$2 AND is_archived=false FOR UPDATE`,[details.employeeId,details.companyId]);
      if (!employee.rowCount || !employeeAccountStatuses.includes(employee.rows[0].status)) {
        await client.query('ROLLBACK'); return res.status(409).json({ error:'EMPLOYEE_ACCOUNT_NOT_ELIGIBLE' });
      }
      const duplicate = await client.query(`SELECT 1 FROM ${q('users')} WHERE lower(username)=$1 OR lower(email)=$2 OR employee_id=$3 LIMIT 1`,[details.username,details.email,details.employeeId]);
      if (duplicate.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error:'EMPLOYEE_ACCOUNT_ALREADY_EXISTS' }); }
      const userId = `user-${crypto.randomUUID()}`;
      await client.query(`INSERT INTO ${q('users')} (id,username,password_hash,name,email,role,company_ids,permissions,employee_id,is_active,email_verified_at)
        VALUES ($1,$2,$3,$4,$5,'EMPLOYEE',$6::jsonb,'[]'::jsonb,$7,true,now())`,[userId,details.username,details.passwordHash,details.name,details.email,JSON.stringify([details.companyId]),details.employeeId]);
      await client.query(`DELETE FROM ${q('registration_requests')} WHERE id=$1`,[requestId]);
      await client.query('COMMIT');
      res.status(201).json({ companyCode:details.companyCode,username:details.username });
    } catch (error) { try { await client.query('ROLLBACK'); } catch {} next(error); }
    finally { client.release(); }
  });

  router.post('/register/start', registrationLimiter, async (req, res, next) => {
    try {
      if (!publicRegistrationEnabled) return res.status(404).json({ error:'REGISTRATION_DISABLED' });
      const companyNameAr = String(req.body?.companyNameAr || '').trim();
      const companyNameEn = String(req.body?.companyNameEn || '').trim();
      const crNumber = String(req.body?.crNumber || '').trim();
      const taxNumber = String(req.body?.taxNumber || '').trim();
      const phone = String(req.body?.phone || '').trim();
      const adminName = String(req.body?.adminName || '').trim();
      const username = String(req.body?.username || '').trim().toLowerCase();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const language = req.body?.language === 'en' ? 'en' : 'ar';
      if (companyNameAr.length < 2 || adminName.length < 2 || !/^[a-z0-9._-]{3,40}$/.test(username)
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isStrongPassword(password)
        || phone.length < 7 || phone.length > 25) {
        return res.status(400).json({ error:'INVALID_REGISTRATION' });
      }
      const duplicate = await pool.query(`SELECT 1 FROM ${q('users')} WHERE lower(username)=$1 OR lower(email)=$2 LIMIT 1`, [username,email]);
      if (duplicate.rowCount) return res.status(409).json({ error:'ACCOUNT_ALREADY_EXISTS' });
      const requestId = crypto.randomUUID();
      const code = String(crypto.randomInt(100000, 1000000));
      const details = { companyNameAr,companyNameEn,crNumber,taxNumber,phone,adminName,username,email,passwordHash:await bcrypt.hash(password,12),language };
      await pool.query(`INSERT INTO ${q('registration_requests')} (id,email,code_hash,details,expires_at)
        VALUES ($1,$2,$3,$4::jsonb,now()+interval '15 minutes')
        ON CONFLICT (email) DO UPDATE SET id=EXCLUDED.id,code_hash=EXCLUDED.code_hash,details=EXCLUDED.details,
          expires_at=EXCLUDED.expires_at,attempts=0,updated_at=now()`,
        [requestId,email,sha256(`${requestId}:${code}`),JSON.stringify(details)]);
      try {
        await sendVerificationEmail(email,code,language);
      } catch (error) {
        await pool.query(`DELETE FROM ${q('registration_requests')} WHERE id=$1`, [requestId]);
        throw error;
      }
      res.status(202).json({ requestId, maskedEmail:email.replace(/^(.{1,2}).*(@.*)$/, '$1***$2'), expiresInSeconds:900 });
    } catch (error) {
      next(error);
    }
  });

  router.post('/register/verify', registrationLimiter, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const requestId = String(req.body?.requestId || '');
      const code = String(req.body?.code || '').trim();
      if (!requestId || !/^\d{6}$/.test(code)) return res.status(400).json({ error:'INVALID_VERIFICATION_CODE' });
      await client.query('BEGIN');
      const request = await client.query(`SELECT * FROM ${q('registration_requests')} WHERE id=$1 FOR UPDATE`, [requestId]);
      const row = request.rows[0];
      if (!row || new Date(row.expires_at).getTime() <= Date.now() || row.attempts >= 5) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error:'VERIFICATION_EXPIRED' });
      }
      if (row.code_hash !== sha256(`${requestId}:${code}`)) {
        await client.query(`UPDATE ${q('registration_requests')} SET attempts=attempts+1,updated_at=now() WHERE id=$1`, [requestId]);
        await client.query('COMMIT');
        return res.status(400).json({ error:'INVALID_VERIFICATION_CODE' });
      }
      const details = row.details;
      const duplicate = await client.query(`SELECT 1 FROM ${q('users')} WHERE lower(username)=$1 OR lower(email)=$2 LIMIT 1`, [details.username,details.email]);
      if (duplicate.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error:'ACCOUNT_ALREADY_EXISTS' });
      }
      const companyId = `comp-${crypto.randomUUID()}`;
      let companyCode = '';
      for (let attempt=0; attempt<10 && !companyCode; attempt += 1) {
        const candidate = String(crypto.randomInt(100000,1000000));
        const exists = await client.query(`SELECT 1 FROM ${q('companies')} WHERE company_code=$1`, [candidate]);
        if (!exists.rowCount) companyCode = candidate;
      }
      if (!companyCode) throw new Error('COMPANY_CODE_GENERATION_FAILED');
      const trialEndsAt = new Date(Date.now()+trialDays*86_400_000).toISOString();
      const payload = newCompanyPayload({ id:companyId,companyCode,...details,trialEndsAt });
      await client.query(`INSERT INTO ${q('companies')}
        (id,company_code,name_ar,name_en,payload,subscription_status,trial_ends_at,is_archived)
        VALUES ($1,$2,$3,$4,$5::jsonb,'TRIAL',$6,false)`,
        [companyId,companyCode,details.companyNameAr,details.companyNameEn || details.companyNameAr,JSON.stringify(payload),trialEndsAt]);
      const userId = `user-${crypto.randomUUID()}`;
      await client.query(`INSERT INTO ${q('users')}
        (id,username,password_hash,name,email,phone,role,company_ids,permissions,is_active,email_verified_at)
        VALUES ($1,$2,$3,$4,$5,$6,'COMPANY_MANAGER',$7::jsonb,$8::jsonb,true,now())`,
        [userId,details.username,details.passwordHash,details.adminName,details.email,details.phone,JSON.stringify([companyId]),JSON.stringify(companyManagerPermissions)]);
      await client.query(`DELETE FROM ${q('registration_requests')} WHERE email=$1`, [details.email]);
      await client.query('COMMIT');
      res.status(201).json({ companyCode,username:details.username,trialEndsAt,trialDays });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      next(error);
    } finally {
      client.release();
    }
  });

  return router;
}
