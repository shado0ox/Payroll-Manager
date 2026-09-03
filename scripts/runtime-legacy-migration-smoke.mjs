import assert from 'node:assert/strict';
import pg from 'pg';

const { Pool } = pg;
const schema = process.env.DB_SCHEMA || 'masar_payroll';
const companyId = process.env.COMPANY_ID || 'comp-1';
const mode = process.argv[2];
const employeeId = 'ci-legacy-employee-1';
const settlementId = 'ci-legacy-settlement-1';

if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('DB_SCHEMA is invalid');
if (!['seed','verify'].includes(mode)) throw new Error('Usage: node scripts/runtime-legacy-migration-smoke.mjs <seed|verify>');

const q = name => `"${schema}".${name}`;
const pool = new Pool({ connectionString:process.env.DATABASE_URL,ssl:false });

const company = {
  id:companyId,
  companyCode:process.env.COMPANY_CODE || '101',
  nameAr:'شركة اختبار الترحيل',
  nameEn:'Legacy Migration Test Company',
  departments:[],
  costCenters:[],
  bankDefinitions:[],
};
const employee = {
  id:employeeId,
  companyId,
  employeeNo:'LEGACY-CI-001',
  nationalIdOrIqama:'2999999999',
  status:'ACTIVE',
  firstNameAr:'موظف',
  lastNameAr:'اختبار',
  firstNameEn:'Legacy',
  lastNameEn:'Test',
  nationality:'NON_SAUDI',
  hireDate:'2026-01-01',
  salaryStartDate:'2026-01-01',
  bankIban:'SA0000000000000000000000',
  salaryPackage:{ baseSalary:1000,housingAllowance:0,transportAllowance:0,otherFixedAllowances:0 },
};
const settlement = {
  id:settlementId,
  companyId,
  employeeId,
  periodMonth:'2026-08',
  amount:500,
  reason:'HELD_PAYROLL',
  status:'PAID',
  paymentMethod:'BANK_TRANSFER',
  paymentDate:'2026-08-31',
  paymentReference:'CI-LEGACY-PAYMENT',
  createdAt:'2026-08-31T12:00:00.000Z',
  paidAt:'2026-08-31T12:00:00.000Z',
};

async function seed() {
  const state = {
    companies:[company],employees:[employee],payrollRuns:[],attendance:[],leaves:[],loans:[],penalties:[],
    temporaryEarnings:[],payrollSettlements:[settlement],journals:[],auditLogs:[],activeCompanyId:companyId,
  };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO ${q('employees')} (
        id,company_id,employee_no,national_id_or_iqama,status,first_name_ar,last_name_ar,first_name_en,last_name_en,
        hire_date,salary_start_date,base_salary,bank_iban,payload,is_archived
      ) VALUES ($1,$2,$3,$4,'ACTIVE',$5,$6,$7,$8,$9,$9,1000,$10,$11::jsonb,false)
      ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,is_archived=false`, [
      employeeId,companyId,employee.employeeNo,employee.nationalIdOrIqama,employee.firstNameAr,employee.lastNameAr,
      employee.firstNameEn,employee.lastNameEn,employee.hireDate,employee.bankIban,JSON.stringify(employee),
    ]);
    await client.query(`INSERT INTO ${q('app_state')} (id,state,version) VALUES (1,$1::jsonb,77)
      ON CONFLICT (id) DO UPDATE SET state=EXCLUDED.state,version=EXCLUDED.version,updated_at=now()`, [JSON.stringify(state)]);
    await client.query(`DELETE FROM ${q('payroll_settlements')}`);
    await client.query(`DELETE FROM ${q('schema_migrations')} WHERE version='005_normalized_settlements'`);
    await client.query(`DELETE FROM ${q('app_state_migration_backups')} WHERE source_version=77`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  console.log('Seeded isolated legacy settlement fixture without a dedupeKey.');
}

async function verify() {
  const [migration,row,count,backup,status] = await Promise.all([
    pool.query(`SELECT 1 FROM ${q('schema_migrations')} WHERE version='005_normalized_settlements'`),
    pool.query(`SELECT dedupe_key,status,amount::text,payload FROM ${q('payroll_settlements')} WHERE id=$1`, [settlementId]),
    pool.query(`SELECT count(*)::integer AS count FROM ${q('payroll_settlements')} WHERE id=$1`, [settlementId]),
    pool.query(`SELECT reason FROM ${q('app_state_migration_backups')} WHERE source_version=77`),
    pool.query(`SELECT counts_match FROM ${q('normalization_status')}`),
  ]);
  assert.equal(migration.rowCount,1,'Settlement migration marker must be committed');
  assert.equal(row.rowCount,1,'Legacy settlement must be preserved');
  assert.equal(row.rows[0].dedupe_key,`LEGACY:${settlementId}`,'Missing legacy dedupeKey must receive a stable text key');
  assert.equal(row.rows[0].status,'PAID');
  assert.equal(Number(row.rows[0].amount),500);
  assert.equal(row.rows[0].payload.paymentReference,'CI-LEGACY-PAYMENT');
  assert.equal(count.rows[0].count,1,'Migration and restart must never duplicate the settlement');
  assert.equal(backup.rowCount,1,'Migration must retain a backup of the source state');
  assert.equal(status.rows[0]?.counts_match,true,'Normalized and compatibility record counts must match');
  console.log('Legacy PostgreSQL migration verified: preserved, backed up, normalized, and idempotent.');
}

try {
  if (mode === 'seed') await seed();
  else await verify();
} finally {
  await pool.end();
}
