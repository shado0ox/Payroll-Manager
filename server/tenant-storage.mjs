const COMPANY_SCOPED_KEYS = ['employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'payrollSettlements', 'journals'];

const normalizeCompanyIds = (companyIds) => [...new Set(
  (Array.isArray(companyIds) ? companyIds : []).filter(id => typeof id === 'string' && id.trim())
)];

const itemCompanyId = (item) => item && typeof item.companyId === 'string' ? item.companyId : '';

export function scopeStateForCompanies(rawState, companyIds) {
  const allowed = new Set(normalizeCompanyIds(companyIds));
  const state = rawState == null ? {} : structuredClone(rawState);

  if (Array.isArray(state.companies)) {
    state.companies = state.companies.filter(company => allowed.has(company?.id));
  }

  for (const key of COMPANY_SCOPED_KEYS) {
    if (Array.isArray(state[key])) {
      state[key] = state[key].filter(item => allowed.has(itemCompanyId(item)));
    }
  }

  // Application audit history is server-owned and append-only. Runtime state saves
  // must never replay, delete or rewrite historical audit records.
  state.auditLogs = [];

  return state;
}

const emptyResult = () => ({ command: 'SKIP', rowCount: 0, rows: [], fields: [] });

export function createTenantScopedClient(client, q, companyIds) {
  const scope = normalizeCompanyIds(companyIds);
  const scoped = (table) => `DELETE FROM ${q(table)} WHERE company_id=ANY($1::text[])`;

  const handlers = new Map([
    [`DELETE FROM ${q('attendance_records')}`, () => client.query(scoped('attendance_records'), [scope])],
    [`DELETE FROM ${q('leave_requests')}`, () => client.query(scoped('leave_requests'), [scope])],
    [`DELETE FROM ${q('loans')}`, () => client.query(scoped('loans'), [scope])],
    [`DELETE FROM ${q('penalties')}`, () => client.query(scoped('penalties'), [scope])],
    [`DELETE FROM ${q('temporary_earnings')}`, () => client.query(scoped('temporary_earnings'), [scope])],
    [`DELETE FROM ${q('payroll_settlements')}`, () => client.query(scoped('payroll_settlements'), [scope])],
    [`DELETE FROM ${q('payroll_payment_batches')}`, () => client.query(scoped('payroll_payment_batches'), [scope])],
    [`DELETE FROM ${q('payroll_runs')}`, () => client.query(scoped('payroll_runs'), [scope])],
    [`DELETE FROM ${q('employees')}`, () => client.query(scoped('employees'), [scope])],
    [`DELETE FROM ${q('company_departments')}`, () => client.query(scoped('company_departments'), [scope])],
    [`DELETE FROM ${q('cost_centers')}`, () => client.query(scoped('cost_centers'), [scope])],
    [`DELETE FROM ${q('company_bank_definitions')}`, () => client.query(scoped('company_bank_definitions'), [scope])],
    [`DELETE FROM ${q('journal_batches')}`, () => client.query(scoped('journal_batches'), [scope])],
  ]);

  return {
    async query(text, params) {
      const sql = String(text).trim();

      // A user without a company scope must never run a destructive normalized-state rewrite.
      if (!scope.length) {
        if (sql.startsWith('DELETE FROM ') || sql.startsWith(`UPDATE ${q('companies')} SET is_archived=true`)) {
          return emptyResult();
        }
      }

      const directHandler = handlers.get(sql);
      if (directHandler) return directHandler();

      if (sql === `DELETE FROM ${q('payroll_payment_batch_items')}`) {
        return client.query(`DELETE FROM ${q('payroll_payment_batch_items')} item
          USING ${q('payroll_payment_batches')} batch
          WHERE item.payment_batch_id=batch.id AND batch.company_id=ANY($1::text[])`, [scope]);
      }

      if (sql === `DELETE FROM ${q('payroll_run_items')}`) {
        return client.query(`DELETE FROM ${q('payroll_run_items')} item
          USING ${q('payroll_runs')} run
          WHERE item.payroll_run_id=run.id AND run.company_id=ANY($1::text[])`, [scope]);
      }

      if (sql === `DELETE FROM ${q('journal_lines')}`) {
        return client.query(`DELETE FROM ${q('journal_lines')} line
          USING ${q('journal_batches')} journal
          WHERE line.journal_batch_id=journal.id AND journal.company_id=ANY($1::text[])`, [scope]);
      }

      if (sql.startsWith(`UPDATE ${q('companies')} SET is_archived=true`)) {
        return client.query(`UPDATE ${q('companies')} SET is_archived=true,updated_at=now()
          WHERE id=ANY($1::text[])`, [scope]);
      }

      // Runtime writes never mutate application audit history through state replacement.
      if (sql === `DELETE FROM ${q('application_audit_logs')}`
        || sql.startsWith(`INSERT INTO ${q('application_audit_logs')} (`)) {
        return emptyResult();
      }

      return client.query(text, params);
    },
  };
}
