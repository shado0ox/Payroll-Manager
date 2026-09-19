import assert from 'node:assert/strict';
import test from 'node:test';

import { createNormalizedStateReader } from './normalized-state-reader.mjs';

test('normalized reader assembles the complete application state sequentially', async () => {
  const rowsByTable = {
    employees: [{ payload:{ id:'employee-1' } }],
    payroll_runs: [{ id:'run-1',payload:{ id:'run-1' } }],
    payroll_run_items: [{ payroll_run_id:'run-1',payload:{ id:'item-1' } }],
    payroll_payment_batches: [{ id:'batch-1',payroll_run_id:'run-1',payload:{ id:'batch-1' } }],
    payroll_payment_batch_items: [{ payment_batch_id:'batch-1',employee_id:'employee-1' }],
    payroll_settlements: [{ payload:{ id:'settlement-1' } }],
    attendance_records: [{ payload:{ id:'attendance-1' } }],
    leave_requests: [{ payload:{ id:'leave-1' } }],
    loans: [{ payload:{ id:'loan-1' } }],
    penalties: [{ payload:{ id:'penalty-1' } }],
    temporary_earnings: [{ payload:{ id:'earning-1' } }],
    companies: [{
      id:'company-1',company_code:'COMP-1',name_ar:'شركة',name_en:'Company',payload:{ timezone:'Asia/Riyadh' },
      subscription_status:'TRIAL',trial_ends_at:new Date('2026-09-30T00:00:00.000Z'),subscription_ends_at:null,
    }],
    company_departments: [{ company_id:'company-1',payload:{ id:'department-1' } }],
    cost_centers: [{ company_id:'company-1',payload:{ id:'cost-1' } }],
    company_bank_definitions: [{ company_id:'company-1',payload:{ ibanBankCode:'80' } }],
    gosi_accounts: [],
    journal_batches: [{ id:'journal-1',payload:{ id:'journal-1' } }],
    journal_lines: [{ journal_batch_id:'journal-1',payload:{ id:'line-1' } }],
    application_audit_logs: [{ payload:{ id:'audit-1' } }],
    integration_configs: [{ company_id:'company-1',public_config:{ organizationId:'org-1' },secret_value:'secret' }],
  };
  let activeQueries = 0;
  let maximumActiveQueries = 0;
  const client = {
    async query(sql) {
      activeQueries += 1;
      maximumActiveQueries = Math.max(maximumActiveQueries, activeQueries);
      await Promise.resolve();
      const table = sql.match(/FROM "([^"]+)"/)?.[1];
      activeQueries -= 1;
      assert.ok(table && table in rowsByTable, `unexpected query: ${sql}`);
      return { rows:rowsByTable[table] };
    },
  };
  const { readNormalizedApplicationState } = createNormalizedStateReader({
    q:name => `"${name}"`,
    clone:value => structuredClone(value),
    subscriptionState:() => ({ status:'TRIAL' }),
  });

  const state = await readNormalizedApplicationState(client);

  assert.equal(maximumActiveQueries, 1);
  assert.deepEqual(state.employees, [{ id:'employee-1' }]);
  assert.deepEqual(state.payrollRuns[0], {
    id:'run-1',items:[{ id:'item-1' }],paymentBatches:[{ id:'batch-1',employeeIds:['employee-1'] }],
  });
  assert.deepEqual(state.payrollSettlements, [{ id:'settlement-1' }]);
  assert.deepEqual(state.attendance, [{ id:'attendance-1' }]);
  assert.deepEqual(state.leaves, [{ id:'leave-1' }]);
  assert.deepEqual(state.loans, [{ id:'loan-1' }]);
  assert.deepEqual(state.penalties, [{ id:'penalty-1' }]);
  assert.deepEqual(state.temporaryEarnings, [{ id:'earning-1' }]);
  assert.deepEqual(state.companies[0], {
    timezone:'Asia/Riyadh',id:'company-1',companyCode:'COMP-1',nameAr:'شركة',nameEn:'Company',
    subscriptionStatus:'TRIAL',trialEndsAt:'2026-09-30T00:00:00.000Z',subscriptionEndsAt:null,
    departments:[{ id:'department-1' }],costCenters:[{ id:'cost-1' }],bankDefinitions:[{ ibanBankCode:'80' }],gosiBranches:[],
  });
  assert.deepEqual(state.journals, [{ id:'journal-1',lines:[{ id:'line-1' }] }]);
  assert.deepEqual(state.auditLogs, [{ id:'audit-1' }]);
  assert.deepEqual(state.qoyodConfigsByCompany, {
    'company-1':{ organizationId:'org-1',apiKey:'secret' },
  });
});
