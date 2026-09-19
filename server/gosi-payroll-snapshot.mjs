const periodStart = month => `${month}-01`;
const periodEnd = month => {
  const [year, monthNumber] = String(month).split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
};

export async function snapshotPayrollGosiBranches(client, q, record) {
  const accountsResult = await client.query(`SELECT id,registration_number,name,branch_name,branch_code,gosi_establishment_number,
      gosi_employer_expense_account,gosi_payable_account,is_default
      FROM ${q('gosi_accounts')} WHERE company_id=$1 AND is_active=true`, [record.companyId]);
  const employeeAssignmentsResult = await client.query(`SELECT a.employee_id,a.account_id FROM ${q('gosi_employee_assignments')} a
      JOIN ${q('employees')} e ON e.id=a.employee_id AND e.company_id=$1 AND e.is_archived=false
      WHERE a.effective_from<=$2::date AND (a.effective_to IS NULL OR a.effective_to>=$3::date)
      ORDER BY a.effective_from DESC,a.id`, [record.companyId,periodEnd(record.periodMonth),periodStart(record.periodMonth)]);
  const departmentAssignmentsResult = await client.query(`SELECT department_name,account_id FROM ${q('gosi_department_assignments')}
      WHERE company_id=$1 AND effective_from<=$2::date AND (effective_to IS NULL OR effective_to>=$3::date)
      ORDER BY effective_from DESC,id`, [record.companyId,periodEnd(record.periodMonth),periodStart(record.periodMonth)]);
  const accounts = new Map(accountsResult.rows.map(row => [row.id,row]));
  const employeeAccounts = new Map();
  for (const row of employeeAssignmentsResult.rows) if (!employeeAccounts.has(row.employee_id)) employeeAccounts.set(row.employee_id,row.account_id);
  const departmentAccounts = new Map();
  for (const row of departmentAssignmentsResult.rows) if (!departmentAccounts.has(row.department_name)) departmentAccounts.set(row.department_name,row.account_id);
  const defaultAccount = accountsResult.rows.find(row => row.is_default) || null;

  return {
    ...record,
    items:(record.items || []).map(item => {
      const accountId = employeeAccounts.get(item.employeeId) || departmentAccounts.get(item.department) || defaultAccount?.id || '';
      const account = accounts.get(accountId);
      if (!account) {
        const { gosiBranchId:_id,gosiBranchCode:_code,gosiBranchName:_name,gosiEstablishmentNumber:_establishment,
          gosiEmployerExpenseAccount:_expense,gosiPayableAccount:_payable,...withoutStaleSnapshot } = item;
        return withoutStaleSnapshot;
      }
      return {
        ...item,
        gosiBranchId:account.id,
        gosiBranchCode:account.branch_code || account.registration_number,
        gosiBranchName:account.branch_name || account.name,
        gosiEstablishmentNumber:account.gosi_establishment_number || account.registration_number,
        gosiEmployerExpenseAccount:account.gosi_employer_expense_account || '',
        gosiPayableAccount:account.gosi_payable_account || '',
      };
    }),
  };
}

export const payrollGosiPeriod = { periodStart,periodEnd };
