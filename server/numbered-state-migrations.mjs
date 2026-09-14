export const NUMBERED_STATE_MIGRATIONS = Object.freeze([
  '001_normalized_payroll',
  '002_normalized_operations',
  '003_normalized_core',
  '004_company_trials',
  '005_normalized_settlements',
]);

export async function runNumberedStateMigrations({ pool,q,replaceNormalizedPayrollData,replaceNormalizedOperationsData,replaceNormalizedCoreData }) {
const migrationClient = await pool.connect();
try {
  await migrationClient.query('BEGIN');
  const payrollMigration = await migrationClient.query(`SELECT 1 FROM ${q('schema_migrations')} WHERE version='001_normalized_payroll'`);
  if (!payrollMigration.rowCount) {
    const marker = await migrationClient.query(`SELECT 1 FROM ${q('app_state_migration_backups')} LIMIT 1`);
    const source = await migrationClient.query(`SELECT state,version FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    if (!marker.rowCount && source.rowCount) {
      await migrationClient.query(`INSERT INTO ${q('app_state_migration_backups')} (source_version,state,reason)
        VALUES ($1,$2::jsonb,'Initial migration from app_state JSONB to normalized payroll tables')`,
        [source.rows[0].version, JSON.stringify(source.rows[0].state)]);
      await replaceNormalizedPayrollData(migrationClient, source.rows[0].state);
    }
    await migrationClient.query(`INSERT INTO ${q('schema_migrations')} (version) VALUES ('001_normalized_payroll')`);
  }

  const operationsMigration = await migrationClient.query(`SELECT 1 FROM ${q('schema_migrations')} WHERE version='002_normalized_operations'`);
  if (!operationsMigration.rowCount) {
    const source = await migrationClient.query(`SELECT state,version FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    if (source.rowCount) {
      await migrationClient.query(`INSERT INTO ${q('app_state_migration_backups')} (source_version,state,reason)
        VALUES ($1,$2::jsonb,'Migration of attendance, leave, loan, penalty and temporary earning data')
        ON CONFLICT (source_version) DO NOTHING`, [source.rows[0].version, JSON.stringify(source.rows[0].state)]);
      await replaceNormalizedOperationsData(migrationClient, source.rows[0].state);
    }
    await migrationClient.query(`INSERT INTO ${q('schema_migrations')} (version) VALUES ('002_normalized_operations')`);
  }

  const coreMigration = await migrationClient.query(`SELECT 1 FROM ${q('schema_migrations')} WHERE version='003_normalized_core'`);
  if (!coreMigration.rowCount) {
    const source = await migrationClient.query(`SELECT state,version FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    if (source.rowCount) {
      await migrationClient.query(`INSERT INTO ${q('app_state_migration_backups')} (source_version,state,reason)
        VALUES ($1,$2::jsonb,'Migration of companies, journals, application audit logs and integration configuration')
        ON CONFLICT (source_version) DO NOTHING`, [source.rows[0].version, JSON.stringify(source.rows[0].state)]);
      await replaceNormalizedCoreData(migrationClient, source.rows[0].state);
    }
    await migrationClient.query(`INSERT INTO ${q('schema_migrations')} (version) VALUES ('003_normalized_core')`);
  }
  await migrationClient.query(`INSERT INTO ${q('schema_migrations')} (version) VALUES ('004_company_trials')
    ON CONFLICT (version) DO NOTHING`);
  const settlementsMigration = await migrationClient.query(`SELECT 1 FROM ${q('schema_migrations')} WHERE version='005_normalized_settlements'`);
  if (!settlementsMigration.rowCount) {
    const source = await migrationClient.query(`SELECT state,version FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    if (source.rowCount) {
      await migrationClient.query(`INSERT INTO ${q('app_state_migration_backups')} (source_version,state,reason)
        VALUES ($1,$2::jsonb,'Migration of payroll settlements to normalized storage')
        ON CONFLICT (source_version) DO NOTHING`, [source.rows[0].version,JSON.stringify(source.rows[0].state)]);
      await migrationClient.query(`INSERT INTO ${q('payroll_settlements')} (
          id,company_id,employee_id,period_month,period_start,period_end,amount,reason,source_payroll_run_id,
          source_payroll_item_id,dedupe_key,status,payment_method,payment_date,payment_reference,created_at,paid_at,
          reversed_at,reversal_reason,payload,sort_order
        ) SELECT settlement->>'id',settlement->>'companyId',settlement->>'employeeId',settlement->>'periodMonth',
          COALESCE(NULLIF(settlement->>'periodStart',''),settlement->>'periodMonth' || '-01')::date,
          COALESCE(NULLIF(settlement->>'periodEnd',''),(date_trunc('month',(settlement->>'periodMonth' || '-01')::date) + interval '1 month - 1 day')::date::text)::date,
          COALESCE(NULLIF(settlement->>'amount','')::numeric,0),settlement->>'reason',NULLIF(settlement->>'sourcePayrollRunId',''),
          NULLIF(settlement->>'sourcePayrollItemId',''),COALESCE(NULLIF(settlement->>'dedupeKey',''),'LEGACY:' || (settlement->>'id')),COALESCE(settlement->>'status','PENDING'),
          NULLIF(settlement->>'paymentMethod',''),NULLIF(settlement->>'paymentDate','')::date,NULLIF(settlement->>'paymentReference',''),
          COALESCE(NULLIF(settlement->>'createdAt','')::timestamptz,now()),NULLIF(settlement->>'paidAt','')::timestamptz,
          NULLIF(settlement->>'reversedAt','')::timestamptz,NULLIF(settlement->>'reversalReason',''),settlement,(ordinality-1)::integer
        FROM jsonb_array_elements(COALESCE($1::jsonb->'payrollSettlements','[]'::jsonb)) WITH ORDINALITY AS source(settlement,ordinality)
        WHERE NULLIF(settlement->>'id','') IS NOT NULL AND NULLIF(settlement->>'companyId','') IS NOT NULL
          AND NULLIF(settlement->>'employeeId','') IS NOT NULL AND NULLIF(settlement->>'amount','')::numeric > 0
        ON CONFLICT (id) DO NOTHING`, [JSON.stringify(source.rows[0].state)]);
    }
    await migrationClient.query(`INSERT INTO ${q('schema_migrations')} (version) VALUES ('005_normalized_settlements')`);
  }
  await migrationClient.query('COMMIT');
} catch (error) {
  await migrationClient.query('ROLLBACK');
  throw error;
} finally {
  migrationClient.release();
}

await pool.query(`DROP VIEW IF EXISTS ${q('normalization_status')}`);
await pool.query(`CREATE VIEW ${q('normalization_status')} AS
  SELECT
    (SELECT count(*) FROM ${q('employees')} WHERE is_archived=false) AS table_employees,
    (SELECT count(*) FROM ${q('payroll_runs')}) AS table_runs,
    (SELECT count(*) FROM ${q('payroll_run_items')}) AS table_items,
    (SELECT count(*) FROM ${q('attendance_records')}) AS table_attendance,
    (SELECT count(*) FROM ${q('leave_requests')}) AS table_leaves,
    (SELECT count(*) FROM ${q('loans')}) AS table_loans,
    (SELECT count(*) FROM ${q('penalties')}) AS table_penalties,
    (SELECT count(*) FROM ${q('temporary_earnings')}) AS table_temporary_earnings,
    (SELECT count(*) FROM ${q('payroll_settlements')}) AS table_payroll_settlements,
    (SELECT count(*) FROM ${q('companies')} WHERE is_archived=false) AS table_companies,
    (SELECT count(*) FROM ${q('company_departments')}) AS table_departments,
    (SELECT count(*) FROM ${q('cost_centers')}) AS table_cost_centers,
    (SELECT count(*) FROM ${q('company_bank_definitions')}) AS table_bank_definitions,
    (SELECT count(*) FROM ${q('journal_batches')}) AS table_journals,
    (SELECT count(*) FROM ${q('journal_lines')}) AS table_journal_lines,
    (SELECT count(*) FROM ${q('application_audit_logs')}) AS table_audit_logs,
    NOT EXISTS (
      SELECT 1 FROM ${q('payroll_runs')} run
      LEFT JOIN LATERAL (
        SELECT count(*)::integer AS item_count,COALESCE(sum(item.net_salary),0) AS item_net_total
        FROM ${q('payroll_run_items')} item WHERE item.payroll_run_id=run.id
      ) totals ON true
      WHERE run.employees_count <> totals.item_count OR run.total_net_salaries <> totals.item_net_total
    ) AS counts_match`);
await pool.query(`ALTER TABLE ${q('app_state')} DROP COLUMN IF EXISTS state`);
await pool.query(`INSERT INTO ${q('app_state')} (id,version) VALUES (1,1) ON CONFLICT (id) DO NOTHING`);
}
