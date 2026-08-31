import fs from 'node:fs';

const path = 'server/index.mjs';
let source = fs.readFileSync(path, 'utf8');

source = source.replace(
  "CHECK (status IN ('ACTIVE','SUSPENDED','ON_LEAVE','TERMINATED','ABSCONDED'))",
  "CHECK (status IN ('ONBOARDING','ACTIVE','SUSPENDED','ON_LEAVE','TERMINATED','ABSCONDED'))"
);

const archiveAnchor = "  await pool.query(`ALTER TABLE ${q('employees')} ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false`);";
if (!source.includes(archiveAnchor)) {
  throw new Error('Employees schema migration anchor not found');
}

if (!source.includes('employees_status_check') || !source.includes('DROP CONSTRAINT IF EXISTS employees_status_check')) {
  const migration = `${archiveAnchor}\n  await pool.query(\`ALTER TABLE \${q('employees')} DROP CONSTRAINT IF EXISTS employees_status_check\`);\n  await pool.query(\`ALTER TABLE \${q('employees')} ADD CONSTRAINT employees_status_check CHECK (status IN ('ONBOARDING','ACTIVE','SUSPENDED','ON_LEAVE','TERMINATED','ABSCONDED'))\`);`;
  source = source.replace(archiveAnchor, migration);
}

if (!source.includes("CHECK (status IN ('ONBOARDING','ACTIVE','SUSPENDED','ON_LEAVE','TERMINATED','ABSCONDED'))")) {
  throw new Error('ONBOARDING status constraint was not applied');
}
if (!source.includes('DROP CONSTRAINT IF EXISTS employees_status_check')) {
  throw new Error('Existing employees status constraint migration was not applied');
}

fs.writeFileSync(path, source);
console.log('PostgreSQL employee status constraint now allows ONBOARDING.');
