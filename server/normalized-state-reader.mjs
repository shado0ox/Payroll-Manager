export function createNormalizedStateReader({ q,clone,subscriptionState }) {
  async function hydrateNormalizedPayrollData(client, rawState) {
    const state = clone(rawState || {});
    // A checked-out pg PoolClient must execute one query at a time. pg@8 only
    // warns when Promise.all queues concurrent calls; pg@9 will reject them.
    const employeeResult = await client.query(`SELECT payload FROM ${q('employees')} WHERE is_archived=false ORDER BY sort_order,id`);
    const employeeGosiBranches = await client.query(`SELECT e.id,COALESCE(employee_assignment.account_id,department_assignment.account_id,default_account.id) AS account_id
      FROM ${q('employees')} e
      LEFT JOIN LATERAL (SELECT account_id FROM ${q('gosi_employee_assignments')} a WHERE a.employee_id=e.id
        AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
        ORDER BY a.effective_from DESC,a.id LIMIT 1) employee_assignment ON true
      LEFT JOIN LATERAL (SELECT account_id FROM ${q('gosi_department_assignments')} d WHERE d.company_id=e.company_id
        AND d.department_name=COALESCE(e.payload->>'department','') AND d.effective_from<=current_date
        AND (d.effective_to IS NULL OR d.effective_to>=current_date) ORDER BY d.effective_from DESC,d.id LIMIT 1) department_assignment ON true
      LEFT JOIN LATERAL (SELECT id FROM ${q('gosi_accounts')} g WHERE g.company_id=e.company_id AND g.is_active=true AND g.is_default=true LIMIT 1) default_account ON true
      WHERE e.is_archived=false`);
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
    const currentGosiBranchByEmployee = new Map(employeeGosiBranches.rows.map(row => [row.id,row.account_id]));
    state.employees = employeeResult.rows.map(row => ({
      ...row.payload,
      ...(currentGosiBranchByEmployee.get(row.payload?.id) ? { gosiBranchId:currentGosiBranchByEmployee.get(row.payload.id) } : {}),
    }));
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
    const gosiBranches = await client.query(`SELECT id,company_id,registration_number,name,branch_name,branch_code,gosi_establishment_number,
      gosi_employer_expense_account,gosi_payable_account,is_default,is_active FROM ${q('gosi_accounts')}
      WHERE is_active=true ORDER BY company_id,is_default DESC,name,id`);
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
    const gosiBranchesByCompany = new Map();
    for(const row of gosiBranches.rows){if(!gosiBranchesByCompany.has(row.company_id))gosiBranchesByCompany.set(row.company_id,[]);gosiBranchesByCompany.get(row.company_id).push({
      id:row.id,name:row.name,branchName:row.branch_name||'',code:row.branch_code||row.registration_number,number:row.registration_number,
      gosiEstablishmentNumber:row.gosi_establishment_number||row.registration_number,
      gosiEmployerExpenseAccount:row.gosi_employer_expense_account||'',gosiPayableAccount:row.gosi_payable_account||'',
      isDefault:row.is_default,isActive:row.is_active,
    });}
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
      gosiBranches: gosiBranchesByCompany.get(row.id) || [],
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
