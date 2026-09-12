export function createPayrollRunPersistence({ q,clone,asArray }) {
  return async function persistReconciledPayrollRun(client,run) {
    const runPayload = clone(run);
    delete runPayload.items;
    delete runPayload.paymentBatches;
    await client.query(`UPDATE ${q('payroll_runs')} SET employees_count=$2,total_gross_salaries=$3,total_deductions=$4,
      total_net_salaries=$5,total_company_cost=$6,payload=$7::jsonb,updated_at=now() WHERE id=$1`, [
      run.id,Number(run.employeesCount || asArray(run.items).length),Number(run.totalGrossSalaries || 0),
      Number(run.totalDeductions || 0),Number(run.totalNetSalaries || 0),Number(run.totalCompanyCost || 0),JSON.stringify(runPayload),
    ]);
    for (const item of asArray(run.items)) {
      await client.query(`UPDATE ${q('payroll_run_items')} SET entitlement_status=$3,entitlement_reason=NULLIF($4,''),
        total_gross_salary=$5,total_deductions=$6,net_salary=$7,payload=$8::jsonb,updated_at=now()
        WHERE payroll_run_id=$1 AND id=$2`, [
        run.id,item.id,item.entitlementStatus || 'PAYABLE',item.entitlementReason || '',Number(item.totalGrossSalary || 0),
        Number(item.totalDeductions || 0),Number(item.netSalary || 0),JSON.stringify(item),
      ]);
    }
  };
}
