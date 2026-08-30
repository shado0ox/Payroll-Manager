import fs from 'node:fs';

const serverUrl = new URL('../server/index.mjs', import.meta.url);

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing transform anchor: ${label}`);
  return source.replace(before, after);
}

let source = fs.readFileSync(serverUrl, 'utf8');

source = replaceOnce(
  source,
  `  await pool.query(\`CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci_unique ON \${q('users')} (lower(email)) WHERE email IS NOT NULL AND btrim(email) <> ''\`);`,
  `  const duplicateUserEmails = await pool.query(\`SELECT lower(email) AS email_key,count(*)::integer AS duplicate_count\n    FROM \${q('users')} WHERE email IS NOT NULL AND btrim(email) <> ''\n    GROUP BY lower(email) HAVING count(*) > 1 LIMIT 1\`);\n  if (!duplicateUserEmails.rowCount) {\n    await pool.query(\`CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci_unique ON \${q('users')} (lower(email)) WHERE email IS NOT NULL AND btrim(email) <> ''\`);\n  } else {\n    console.warn('Skipping users_email_ci_unique because duplicate user emails already exist; resolve duplicates before enforcing the index.');\n  }`,
  'safe user email index creation',
);

source = replaceOnce(
  source,
  `    const existing = await pool.query(\`SELECT id,password_hash,company_ids,role FROM \${q('users')} WHERE id=$1\`, [req.params.id]);`,
  `    const normalizedEmail = String(u.email || '').trim().toLowerCase();\n    if (normalizedEmail) {\n      const duplicateEmail = await pool.query(\`SELECT id FROM \${q('users')} WHERE lower(email)=lower($1) AND id<>$2 LIMIT 1\`, [normalizedEmail, req.params.id]);\n      if (duplicateEmail.rowCount) return res.status(409).json({ error:'USER_EMAIL_EXISTS' });\n    }\n    const existing = await pool.query(\`SELECT id,password_hash,company_ids,role FROM \${q('users')} WHERE id=$1\`, [req.params.id]);`,
  'user email duplicate validation',
);

source = replaceOnce(
  source,
  `      req.params.id, String(u.username).toLowerCase(), passwordHash, u.name, u.email || '', u.phone || '', u.role, JSON.stringify(u.companyIds), JSON.stringify(permissions), u.isActive !== false`,
  `      req.params.id, String(u.username).toLowerCase(), passwordHash, u.name, normalizedEmail, u.phone || '', u.role, JSON.stringify(u.companyIds), JSON.stringify(permissions), u.isActive !== false`,
  'normalized user email write',
);

source = replaceOnce(
  source,
  `  } catch (e) { if (e?.code === '23505') return res.status(409).json({ error:'USERNAME_EXISTS' }); next(e); }\n});\n\napp.delete('/api/users/:id'`,
  `  } catch (e) {\n    if (e?.code === '23505') {\n      const constraint = String(e.constraint || '');\n      return res.status(409).json({ error:constraint.includes('email') ? 'USER_EMAIL_EXISTS' : 'USERNAME_EXISTS' });\n    }\n    next(e);\n  }\n});\n\napp.delete('/api/users/:id'`,
  'user uniqueness error mapping',
);

fs.writeFileSync(serverUrl, source);
console.log('Password reset safety hardening applied.');
