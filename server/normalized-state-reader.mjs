export function createNormalizedStateReader({ q,clone,subscriptionState }) {
  async function hydrateNormalizedPayrollData(client, rawState) {
    const state = clone(rawState || {});
    // A checked-out pg PoolClient must execute one query at a time. pg@8 only
    // warns when Promise.all queues concurrent calls; pg@9 will reject them.
    const employeeResult = await client.query(`SELECT payload FROM ${q('employees')} WHERE is_archived=false ORDER BY sort_order,id`);
    const runResult = await client.query(`SELECT id,payload FROM ${q('payroll_runs')} ORDER BY sort_order,id`);
    const itemResult = await client.query(`SELECT payroll_run_id,payload FROM ${q('payroll_run_items')} ORDER BY payroll_run_id,sort_order,id`);
    const batchResult = await client.query(`SELECT id,payroll_run_id,payload FROM ${q('payroll_payment_batches')} ORDER BY payroll_run_id,sort_order,id`);
    const batchItemResult = await client.query(`SELECT payment_batch_id,employee_id FROM ${q('payroll_payment_batch_items')} ORDER BY payment_batch_id,sort_order`);
    const settlementResult = await client.query(`SELECT payload FROM ${q('payroll_settlements')} ORDER BY sort_order,id`);
    const itemsByRun = new Map();
    for (const row of itemResult.rows) {
      if (!itemsByRun.has(row.payroll_run_id)) itemsByRun.set(row.payroll_run_id, []);
      itemsByRun.get(row.payroll_run_id).push(row.payload);
    }
    const employeeIdsByBatch = new Map();
    for (const row of batchItemResult.rows) {
      if (!employeeIdsByBatch.has(row.payment_batch_id)) employeeIdsByBatch.set(row.payment_batch_id, []);
      employeeIdsByBatch.get(row.payment_batch_id).push(row.employee_id);
    }
    const batchesByRun = new Map();
    for (const row of batchResult.rows) {
      if (!batchesByRun.has(row.payroll_run_id)) batchesByRun.set(row.payroll_run_id, []);
      batchesByRun.get(row.payroll_run_id).push({ ...row.payload, employeeIds: employeeIdsByBatch.get(row.id) || [] });
    }
    state.employees = employeeResult.rows.map(row => row.payload);
    state.payrollRuns = runResult.rows.map(row => ({
      ...row.payload,
      items: itemsByRun.get(row.id) || [],
      paymentBatches: batchesByRun.get(row.id) || [],
    }));
    state.payrollSettlements = settlementResult.rows.map(row => row.payload);
    return state;
  }

  async function hydrateNormalizedOperationsData(client, rawState) {
    const state = clone(rawState || {});
    const attendance = await client.query(`SELECT payload FROM ${q('attendance_records')} ORDER BY sort_order,id`);
    const leaves = await client.query(`SELECT payload FROM ${q('leave_requests')} ORDER BY sort_order,id`);
    const loans = await client.query(`SELECT payload FROM ${q('loans')} ORDER BY sort_order,id`);
    const penalties = await client.query(`SELECT payload FROM ${q('penalties')} ORDER BY sort_order,id`);
    const temporaryEarnings = await client.query(`SELECT payload FROM ${q('temporary_earnings')} ORDER BY sort_order,id`);
    state.attendance = attendance.rows.map(row => row.payload);
    state.leaves = leaves.rows.map(row => row.payload);
    state.loans = loans.rows.map(row => row.payload);
    state.penalties = penalties.rows.map(row => row.payload);
    state.temporaryEarnings = temporaryEarnings.rows.map(row => row.payload);
    return state;
  }

  async function hydrateNormalizedCoreData(client, rawState) {
    const state = clone(rawState || {});
    const companies = await client.query(`SELECT id,company_code,name_ar,name_en,payload,subscription_status,trial_ends_at,subscription_ends_at,
      subscription_suspended_at,deletion_scheduled_at
      FROM ${q('companies')} WHERE is_archived=false ORDER BY sort_order,id`);
    const departments = await client.query(`SELECT company_id,payload FROM ${q('company_departments')} ORDER BY company_id,sort_order,id`);
    const costCenters = await client.query(`SELECT company_id,payload FROM ${q('cost_centers')} ORDER BY company_id,sort_order,id`);
    const bankDefinitions = await client.query(`SELECT company_id,payload FROM ${q('company_bank_definitions')} ORDER BY company_id,sort_order,iban_bank_code`);
    const journals = await client.query(`SELECT id,payload FROM ${q('journal_batches')} ORDER BY sort_order,id`);
    const journalLines = await client.query(`SELECT journal_batch_id,payload FROM ${q('journal_lines')} ORDER BY journal_batch_id,sort_order,id`);
    const auditLogs = await client.query(`SELECT payload FROM ${q('application_audit_logs')} ORDER BY sort_order,id`);
    const integration = await client.query(`SELECT company_id,public_config,secret_value FROM ${q('integration_configs')} WHERE provider='QOYOD'`);
    const linesByJournal = new Map();
    for (const row of journalLines.rows) {
      if (!linesByJournal.has(row.journal_batch_id)) linesByJournal.set(row.journal_batch_id, []);
      linesByJournal.get(row.journal_batch_id).push(row.payload);
    }
    const groupPayloads = (rows) => {
      const grouped = new Map();
      for (const row of rows) {
        if (!grouped.has(row.company_id)) grouped.set(row.company_id, []);
        grouped.get(row.company_id).push(row.payload);
      }
      return grouped;
    };
    const departmentsByCompany = groupPayloads(departments.rows);
    const costCentersByCompany = groupPayloads(costCenters.rows);
    const bankDefinitionsByCompany = groupPayloads(bankDefinitions.rows);
    state.companies = companies.rows.map(row => {
      const subscription = subscriptionState(row);
      return ({
      ...row.payload,
      id:row.id,
      companyCode:row.company_code,
      nameAr:row.name_ar,
      nameEn:row.name_en,
      subscriptionStatus:subscription.status,
      trialEndsAt:row.trial_ends_at?.toISOString?.() || row.trial_ends_at || null,
      subscriptionEndsAt:row.subscription_ends_at?.toISOString?.() || row.subscription_ends_at || null,
      ...(subscription.suspendedAt !== undefined ? { subscriptionSuspendedAt: subscription.suspendedAt } : {}),
      ...(subscription.deletionScheduledAt !== undefined ? { deletionScheduledAt: subscription.deletionScheduledAt } : {}),
      departments: departmentsByCompany.get(row.id) || [],
      costCenters: costCentersByCompany.get(row.id) || [],
      bankDefinitions: bankDefinitionsByCompany.get(row.id) || [],
      });
    });
    state.journals = journals.rows.map(row => ({ ...row.payload, lines: linesByJournal.get(row.id) || [] }));
    state.auditLogs = auditLogs.rows.map(row => row.payload);
    state.qoyodConfigsByCompany = Object.fromEntries(integration.rows
      .filter(row => row.company_id)
      .map(row => [row.company_id, { ...row.public_config, apiKey: row.secret_value || '' }]));
    return state;
  }

  async function readNormalizedApplicationState(client) {
    const payrollState = await hydrateNormalizedPayrollData(client, {});
    const operationsState = await hydrateNormalizedOperationsData(client, payrollState);
    return hydrateNormalizedCoreData(client, operationsState);
  }

  return { readNormalizedApplicationState };
}
