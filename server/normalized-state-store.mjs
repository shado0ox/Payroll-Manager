import { createPayrollRunPersistence } from './payroll-run-persistence.mjs';
import { createNormalizedStateReader } from './normalized-state-reader.mjs';

const asArray = value => Array.isArray(value) ? value : [];

export function createNormalizedStateStore({ q,clone,subscriptionState }) {
const asArray = (value) => Array.isArray(value) ? value : [];
const persistReconciledPayrollRun = createPayrollRunPersistence({ q,clone,asArray });
const { readNormalizedApplicationState } = createNormalizedStateReader({ q,clone,subscriptionState });

async function replaceNormalizedPayrollData(client, state) {
  const companies = asArray(state?.companies);
  const employees = asArray(state?.employees);
  const payrollRuns = asArray(state?.payrollRuns);
  const payrollSettlements = asArray(state?.payrollSettlements);

  await client.query(`INSERT INTO ${q('companies')} (id,company_code,name_ar,name_en,is_archived)
    SELECT company->>'id',company->>'companyCode',COALESCE(company->>'nameAr',''),COALESCE(company->>'nameEn',''),false
    FROM jsonb_array_elements($1::jsonb) AS source(company)
    ON CONFLICT (id) DO UPDATE SET company_code=EXCLUDED.company_code,name_ar=EXCLUDED.name_ar,name_en=EXCLUDED.name_en,is_archived=false`,
    [JSON.stringify(companies)]);

  // Operational rows reference employees, so clear them before replacing employee identities.
  await client.query(`DELETE FROM ${q('attendance_records')}`);
  await client.query(`DELETE FROM ${q('leave_requests')}`);
  await client.query(`DELETE FROM ${q('loans')}`);
  await client.query(`DELETE FROM ${q('penalties')}`);
  await client.query(`DELETE FROM ${q('temporary_earnings')}`);
  await client.query(`DELETE FROM ${q('payroll_settlements')}`);
  await client.query(`DELETE FROM ${q('payroll_payment_batch_items')}`);
  await client.query(`DELETE FROM ${q('payroll_payment_batches')}`);
  await client.query(`DELETE FROM ${q('payroll_run_items')}`);
  await client.query(`DELETE FROM ${q('payroll_runs')}`);
  await client.query(`DELETE FROM ${q('employees')}`);

  await client.query(`INSERT INTO ${q('employees')} (
      id,company_id,employee_no,national_id_or_iqama,status,first_name_ar,last_name_ar,first_name_en,last_name_en,
      department,job_title,hire_date,salary_start_date,termination_date,suspension_start_date,suspension_end_date,
      base_salary,housing_allowance,transport_allowance,other_fixed_allowances,bank_iban,payload,sort_order,is_archived
    )
    SELECT employee->>'id',employee->>'companyId',employee->>'employeeNo',COALESCE(employee->>'nationalIdOrIqama',''),
      COALESCE(employee->>'status','ACTIVE'),COALESCE(employee->>'firstNameAr',''),COALESCE(employee->>'lastNameAr',''),
      COALESCE(employee->>'firstNameEn',''),COALESCE(employee->>'lastNameEn',''),COALESCE(employee->>'department',''),
      COALESCE(employee->>'jobTitle',''),NULLIF(employee->>'hireDate','')::date,NULLIF(employee->>'salaryStartDate','')::date,
      NULLIF(employee->>'terminationDate','')::date,NULLIF(employee->>'suspensionStartDate','')::date,NULLIF(employee->>'suspensionEndDate','')::date,
      COALESCE(NULLIF(employee->'salaryPackage'->>'baseSalary','')::numeric,0),
      COALESCE(NULLIF(employee->'salaryPackage'->>'housingAllowance','')::numeric,0),
      COALESCE(NULLIF(employee->'salaryPackage'->>'transportAllowance','')::numeric,0),
      COALESCE(NULLIF(employee->'salaryPackage'->>'otherFixedAllowances','')::numeric,0),
      COALESCE(employee->>'bankIban',''),employee,(ordinality - 1)::integer,false
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(employee, ordinality)`, [JSON.stringify(employees)]);

  await client.query(`INSERT INTO ${q('payroll_runs')} (
      id,company_id,period_month,status,employees_count,total_gross_salaries,total_deductions,total_net_salaries,
      total_company_cost,created_at,calculated_at,approved_at,posted_at,payload,sort_order
    )
    SELECT run->>'id',run->>'companyId',run->>'periodMonth',COALESCE(run->>'status','DRAFT'),
      COALESCE(NULLIF(run->>'employeesCount','')::integer,0),COALESCE(NULLIF(run->>'totalGrossSalaries','')::numeric,0),
      COALESCE(NULLIF(run->>'totalDeductions','')::numeric,0),COALESCE(NULLIF(run->>'totalNetSalaries','')::numeric,0),
      COALESCE(NULLIF(run->>'totalCompanyCost','')::numeric,0),NULLIF(run->>'createdAt','')::timestamptz,
      NULLIF(run->>'calculatedAt','')::timestamptz,NULLIF(run->>'approvedAt','')::timestamptz,NULLIF(run->>'postedAt','')::timestamptz,
      run - 'items' - 'paymentBatches',(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(run, ordinality)`, [JSON.stringify(payrollRuns)]);

  await client.query(`INSERT INTO ${q('payroll_run_items')} (
      payroll_run_id,id,employee_id,employee_no,employee_name,entitlement_status,entitlement_reason,
      base_salary,total_gross_salary,total_deductions,net_salary,payload,sort_order
    )
    SELECT run->>'id',item->>'id',item->>'employeeId',COALESCE(item->>'employeeNo',''),COALESCE(item->>'employeeName',''),
      COALESCE(item->>'entitlementStatus','PAYABLE'),NULLIF(item->>'entitlementReason',''),
      COALESCE(NULLIF(item->>'baseSalary','')::numeric,0),COALESCE(NULLIF(item->>'totalGrossSalary','')::numeric,0),
      COALESCE(NULLIF(item->>'totalDeductions','')::numeric,0),COALESCE(NULLIF(item->>'netSalary','')::numeric,0),
      item,(item_ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) AS runs(run)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(run->'items','[]'::jsonb)) WITH ORDINALITY AS items(item,item_ordinality)`, [JSON.stringify(payrollRuns)]);

  await client.query(`INSERT INTO ${q('payroll_payment_batches')} (
      id,payroll_run_id,company_id,batch_number,status,method,total_amount,scheduled_date,payment_date,payload,sort_order
    )
    SELECT batch->>'id',run->>'id',batch->>'companyId',COALESCE(batch->>'batchNumber',''),COALESCE(batch->>'status','SCHEDULED'),
      COALESCE(batch->>'method','BANK_TRANSFER'),COALESCE(NULLIF(batch->>'totalAmount','')::numeric,0),
      NULLIF(batch->>'scheduledDate','')::date,NULLIF(batch->>'paymentDate','')::date,
      batch - 'employeeIds',(batch_ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) AS runs(run)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(run->'paymentBatches','[]'::jsonb)) WITH ORDINALITY AS batches(batch,batch_ordinality)`, [JSON.stringify(payrollRuns)]);

  await client.query(`INSERT INTO ${q('payroll_payment_batch_items')} (payment_batch_id,employee_id,sort_order)
    SELECT batch->>'id',employee_id,(employee_ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) AS runs(run)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(run->'paymentBatches','[]'::jsonb)) AS batches(batch)
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(batch->'employeeIds','[]'::jsonb)) WITH ORDINALITY AS employee_ids(employee_id,employee_ordinality)`, [JSON.stringify(payrollRuns)]);

  await client.query(`INSERT INTO ${q('payroll_settlements')} (
      id,company_id,employee_id,period_month,period_start,period_end,amount,reason,source_payroll_run_id,
      source_payroll_item_id,dedupe_key,status,payment_method,payment_date,payment_reference,created_at,paid_at,
      reversed_at,reversal_reason,payload,sort_order
    ) SELECT settlement->>'id',settlement->>'companyId',settlement->>'employeeId',settlement->>'periodMonth',
      NULLIF(settlement->>'periodStart','')::date,NULLIF(settlement->>'periodEnd','')::date,
      COALESCE(NULLIF(settlement->>'amount','')::numeric,0),settlement->>'reason',NULLIF(settlement->>'sourcePayrollRunId',''),
      NULLIF(settlement->>'sourcePayrollItemId',''),settlement->>'dedupeKey',COALESCE(settlement->>'status','PENDING'),
      NULLIF(settlement->>'paymentMethod',''),NULLIF(settlement->>'paymentDate','')::date,NULLIF(settlement->>'paymentReference',''),
      NULLIF(settlement->>'createdAt','')::timestamptz,NULLIF(settlement->>'paidAt','')::timestamptz,
      NULLIF(settlement->>'reversedAt','')::timestamptz,NULLIF(settlement->>'reversalReason',''),settlement,(ordinality-1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(settlement,ordinality)`, [JSON.stringify(payrollSettlements)]);
}

async function replaceNormalizedOperationsData(client, state) {
  const attendance = asArray(state?.attendance);
  const leaves = asArray(state?.leaves);
  const loans = asArray(state?.loans);
  const penalties = asArray(state?.penalties);
  const temporaryEarnings = asArray(state?.temporaryEarnings);

  await client.query(`DELETE FROM ${q('attendance_records')}`);
  await client.query(`DELETE FROM ${q('leave_requests')}`);
  await client.query(`DELETE FROM ${q('loans')}`);
  await client.query(`DELETE FROM ${q('penalties')}`);
  await client.query(`DELETE FROM ${q('temporary_earnings')}`);

  const operationalSources = [attendance, leaves, loans, penalties, temporaryEarnings].flat();
  await client.query(`INSERT INTO ${q('employees')} (
      id,company_id,employee_no,national_id_or_iqama,status,first_name_ar,last_name_ar,first_name_en,last_name_en,
      payload,sort_order,is_archived
    )
    SELECT DISTINCT ON (record->>'employeeId') record->>'employeeId',record->>'companyId',
      'ARCHIVED-' || left(record->>'employeeId',32),'','TERMINATED','موظف','مؤرشف','Archived','Employee',
      jsonb_build_object('id',record->>'employeeId','companyId',record->>'companyId','employeeNo','ARCHIVED-' || left(record->>'employeeId',32),'status','TERMINATED'),
      2147483647,true
    FROM jsonb_array_elements($1::jsonb) AS source(record)
    WHERE NULLIF(record->>'employeeId','') IS NOT NULL AND NULLIF(record->>'companyId','') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ${q('employees')} employee WHERE employee.id=record->>'employeeId')
    ON CONFLICT (id) DO NOTHING`, [JSON.stringify(operationalSources)]);

  await client.query(`INSERT INTO ${q('attendance_records')} (
      id,company_id,employee_id,period_month,record_date,end_date,days_count,delay_minutes,absence,unpaid_leave,
      overtime_hours,overtime_type,notes,payload,sort_order
    )
    SELECT record->>'id',record->>'companyId',record->>'employeeId',record->>'periodMonth',NULLIF(record->>'date','')::date,
      NULLIF(record->>'endDate','')::date,COALESCE(NULLIF(record->>'daysCount','')::integer,1),
      COALESCE(NULLIF(record->>'delayMinutes','')::integer,0),COALESCE((record->>'absence')::boolean,false),
      COALESCE((record->>'unpaidLeave')::boolean,false),COALESCE(NULLIF(record->>'overtimeHours','')::numeric,0),
      COALESCE(record->>'overtimeType','STANDARD'),NULLIF(record->>'notes',''),record,(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(record,ordinality)`, [JSON.stringify(attendance)]);

  await client.query(`INSERT INTO ${q('leave_requests')} (
      id,company_id,employee_id,leave_type,start_date,end_date,days_count,status,is_paid,reason,payload,sort_order
    )
    SELECT leave->>'id',leave->>'companyId',leave->>'employeeId',leave->>'type',NULLIF(leave->>'startDate','')::date,
      NULLIF(leave->>'endDate','')::date,COALESCE(NULLIF(leave->>'daysCount','')::integer,0),COALESCE(leave->>'status','PENDING'),
      COALESCE((leave->>'isPaid')::boolean,false),NULLIF(leave->>'reason',''),leave,(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(leave,ordinality)`, [JSON.stringify(leaves)]);

  await client.query(`INSERT INTO ${q('loans')} (
      id,company_id,employee_id,total_amount,monthly_installment,total_installments,remaining_installments,
      remaining_amount,start_month,status,reason,payload,sort_order
    )
    SELECT loan->>'id',loan->>'companyId',loan->>'employeeId',COALESCE(NULLIF(loan->>'totalAmount','')::numeric,0),
      COALESCE(NULLIF(loan->>'monthlyInstallment','')::numeric,0),COALESCE(NULLIF(loan->>'totalInstallments','')::integer,0),
      COALESCE(NULLIF(loan->>'remainingInstallments','')::integer,0),COALESCE(NULLIF(loan->>'remainingAmount','')::numeric,0),
      loan->>'startDate',COALESCE(loan->>'status','ACTIVE'),COALESCE(loan->>'reason',''),loan,(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(loan,ordinality)`, [JSON.stringify(loans)]);

  await client.query(`INSERT INTO ${q('penalties')} (
      id,company_id,employee_id,period_month,record_date,reason,amount,applied_in_payroll,payload,sort_order
    )
    SELECT penalty->>'id',penalty->>'companyId',penalty->>'employeeId',penalty->>'periodMonth',
      NULLIF(penalty->>'date','')::date,COALESCE(penalty->>'reason',''),COALESCE(NULLIF(penalty->>'amount','')::numeric,0),
      COALESCE((penalty->>'appliedInPayroll')::boolean,false),penalty,(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(penalty,ordinality)`, [JSON.stringify(penalties)]);

  await client.query(`INSERT INTO ${q('temporary_earnings')} (
      id,company_id,employee_id,period_month,record_date,earning_type,amount,reason,applied_in_payroll,payload,sort_order
    )
    SELECT earning->>'id',earning->>'companyId',earning->>'employeeId',earning->>'periodMonth',
      NULLIF(earning->>'date','')::date,earning->>'type',COALESCE(NULLIF(earning->>'amount','')::numeric,0),
      COALESCE(earning->>'reason',''),COALESCE((earning->>'appliedInPayroll')::boolean,false),earning,(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(earning,ordinality)`, [JSON.stringify(temporaryEarnings)]);
}

async function replaceNormalizedCoreData(client, state) {
  const companies = asArray(state?.companies);
  const journals = asArray(state?.journals);
  const auditLogs = asArray(state?.auditLogs);
  const qoyodConfig = state?.qoyodConfig && typeof state.qoyodConfig === 'object' ? state.qoyodConfig : {};
  const companyIdsForConfig = new Set(companies.map(company => String(company?.id || '')).filter(Boolean));
  const requestedQoyodCompanyId = String(state?.activeCompanyId || '');
  const qoyodCompanyId = companyIdsForConfig.has(requestedQoyodCompanyId)
    ? requestedQoyodCompanyId
    : (String(companies[0]?.id || ''));

  await client.query(`UPDATE ${q('companies')} SET is_archived=true,updated_at=now()`);
  await client.query(`INSERT INTO ${q('companies')} (id,company_code,name_ar,name_en,payload,sort_order,is_archived)
    SELECT company->>'id',company->>'companyCode',COALESCE(company->>'nameAr',''),COALESCE(company->>'nameEn',''),
      company - 'departments' - 'costCenters' - 'bankDefinitions',(ordinality - 1)::integer,false
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(company,ordinality)
    ON CONFLICT (id) DO UPDATE SET company_code=EXCLUDED.company_code,name_ar=EXCLUDED.name_ar,name_en=EXCLUDED.name_en,
      payload=EXCLUDED.payload,sort_order=EXCLUDED.sort_order,is_archived=false,updated_at=now()`, [JSON.stringify(companies)]);

  await client.query(`DELETE FROM ${q('company_departments')}`);
  await client.query(`DELETE FROM ${q('cost_centers')}`);
  await client.query(`DELETE FROM ${q('company_bank_definitions')}`);
  await client.query(`INSERT INTO ${q('company_departments')} (company_id,id,code,name_ar,name_en,payload,sort_order)
    SELECT company->>'id',department->>'id',COALESCE(department->>'code',''),COALESCE(department->>'nameAr',''),
      COALESCE(department->>'nameEn',''),department,(department_ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) AS companies(company)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(company->'departments','[]'::jsonb)) WITH ORDINALITY AS departments(department,department_ordinality)`,
    [JSON.stringify(companies)]);
  await client.query(`INSERT INTO ${q('cost_centers')} (company_id,id,code,name_ar,name_en,payload,sort_order)
    SELECT company->>'id',center->>'id',COALESCE(center->>'code',''),COALESCE(center->>'nameAr',''),
      COALESCE(center->>'nameEn',''),center,(center_ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) AS companies(company)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(company->'costCenters','[]'::jsonb)) WITH ORDINALITY AS centers(center,center_ordinality)`,
    [JSON.stringify(companies)]);
  await client.query(`INSERT INTO ${q('company_bank_definitions')} (company_id,iban_bank_code,name_ar,name_en,swift_code,is_active,payload,sort_order)
    SELECT company->>'id',bank->>'ibanBankCode',COALESCE(bank->>'nameAr',''),COALESCE(bank->>'nameEn',''),
      COALESCE(bank->>'swiftCode',''),COALESCE((bank->>'isActive')::boolean,true),bank,(bank_ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) AS companies(company)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(company->'bankDefinitions','[]'::jsonb)) WITH ORDINALITY AS banks(bank,bank_ordinality)`,
    [JSON.stringify(companies)]);

  await client.query(`DELETE FROM ${q('journal_lines')}`);
  await client.query(`DELETE FROM ${q('journal_batches')}`);
  await client.query(`INSERT INTO ${q('journal_batches')} (
      id,company_id,payroll_run_id,period_month,batch_number,journal_date,description,status,total_debit,total_credit,payload,sort_order
    )
    SELECT journal->>'id',journal->>'companyId',journal->>'payrollRunId',journal->>'periodMonth',COALESCE(journal->>'batchNumber',''),
      NULLIF(journal->>'date','')::date,COALESCE(journal->>'description',''),COALESCE(journal->>'status','DRAFT'),
      COALESCE(NULLIF(journal->>'totalDebit','')::numeric,0),COALESCE(NULLIF(journal->>'totalCredit','')::numeric,0),
      journal - 'lines',(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(journal,ordinality)`, [JSON.stringify(journals)]);
  await client.query(`INSERT INTO ${q('journal_lines')} (
      journal_batch_id,id,account_code,account_name_ar,description_ar,debit,credit,cost_center_code,payload,sort_order
    )
    SELECT journal->>'id',line->>'id',COALESCE(line->>'accountCode',''),COALESCE(line->>'accountNameAr',''),
      COALESCE(line->>'descriptionAr',''),COALESCE(NULLIF(line->>'debit','')::numeric,0),
      COALESCE(NULLIF(line->>'credit','')::numeric,0),NULLIF(line->>'costCenterCode',''),line,(line_ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) AS journals(journal)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(journal->'lines','[]'::jsonb)) WITH ORDINALITY AS lines(line,line_ordinality)`,
    [JSON.stringify(journals)]);

  await client.query(`DELETE FROM ${q('application_audit_logs')}`);
  await client.query(`INSERT INTO ${q('application_audit_logs')} (
      id,company_id,user_id,user_name,user_role,action,entity_type,entity_id,occurred_at,details,payload,sort_order
    )
    SELECT log->>'id',NULLIF(log->>'companyId',''),NULLIF(log->>'userId',''),COALESCE(log->>'userName',''),
      COALESCE(log->>'userRole','OPERATIONS_MANAGER'),COALESCE(log->>'action',''),NULLIF(COALESCE(log->>'entityType',log->>'entity'),''),
      COALESCE(log->>'entityId',''),NULLIF(log->>'timestamp','')::timestamptz,NULLIF(log->>'details',''),log,(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(log,ordinality)`, [JSON.stringify(auditLogs)]);

  const { apiKey = '', apiKeyConfigured: _ignored, ...publicConfig } = qoyodConfig;
  if (qoyodCompanyId) {
    await client.query(`INSERT INTO ${q('integration_configs')} (company_id,provider,public_config,secret_value,updated_at)
      VALUES ($1,'QOYOD',$2::jsonb,$3,now())
      ON CONFLICT (company_id,provider) DO UPDATE SET public_config=EXCLUDED.public_config,
        secret_value=CASE WHEN EXCLUDED.secret_value <> '' THEN EXCLUDED.secret_value ELSE ${q('integration_configs')}.secret_value END,
        updated_at=now()`, [qoyodCompanyId, JSON.stringify(publicConfig), String(apiKey || '')]);
  }
}

  return { asArray,persistReconciledPayrollRun,replaceNormalizedPayrollData,replaceNormalizedOperationsData,replaceNormalizedCoreData,readNormalizedApplicationState };
}
