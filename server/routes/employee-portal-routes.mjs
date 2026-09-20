import express from 'express';

const number = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const array = value => Array.isArray(value) ? value : [];

const safePayrollSnapshot = (row, periodMonth) => {
  if (!row) return null;
  const item = row.payload || {};
  return {
    payrollRunId:row.payroll_run_id,
    payrollRunItemId:row.id,
    periodMonth,
    employeeNo:String(row.employee_no || item.employeeNo || ''),
    employeeName:String(row.employee_name || item.employeeName || ''),
    department:String(item.department || ''),
    earnings:{
      baseSalary:number(item.baseSalary ?? row.base_salary),housingAllowance:number(item.housingAllowance),
      transportAllowance:number(item.transportAllowance),otherAllowances:number(item.otherAllowances),
      nonGosiAllowances:number(item.nonGosiAllowances),overtimeAmount:number(item.overtimeAmount),
      overtimeHours:number(item.overtimeHours),bonuses:number(item.bonuses),manualAddition:number(item.manualAddition),
      totalGrossSalary:number(item.totalGrossSalary ?? row.total_gross_salary),
    },
    deductions:{
      delayMinutes:number(item.delayMinutes),delayDeduction:number(item.delayDeduction),
      absenceDays:number(item.absenceDays),absenceDeduction:number(item.absenceDeduction),
      unpaidLeaveDays:number(item.unpaidLeaveDays),unpaidLeaveDeduction:number(item.unpaidLeaveDeduction),
      gosiEmployeeShare:number(item.gosiEmployeeShare),loanDeduction:number(item.loanDeduction),
      penaltiesDeduction:number(item.penaltiesDeduction),otherDeductions:number(item.otherDeductions),
      manualDeduction:number(item.manualDeduction),totalDeductions:number(item.totalDeductions ?? row.total_deductions),
    },
    netSalary:number(item.netSalary ?? row.net_salary),
    payableDays:item.payableDays == null ? null : number(item.payableDays),
    adjustmentNotes:String(item.adjustmentNotes || ''),
  };
};

export function buildEmployeePaidPayslips(batchRows, itemRows, employeeId) {
  const rowsByRun = new Map(itemRows.map(row => [row.payroll_run_id,row]));
  const rowsByPeriod = new Map(itemRows.map(row => [row.period_month,row]));
  const payslips = [];
  for (const batchRow of batchRows) {
    const batch = batchRow.batch_payload || {};
    const direct = array(batchRow.employee_ids).includes(employeeId);
    const paymentItem = rowsByRun.get(batchRow.payroll_run_id);
    const coverages = new Map();
    const add = coverage => {
      if (!coverage.periodMonth || coverage.amount <= 0 || coverages.has(coverage.periodMonth)) return;
      coverages.set(coverage.periodMonth,coverage);
    };
    if (direct && paymentItem) {
      const paymentPayload = paymentItem.payload || {};
      const priorDetails = array(paymentPayload.priorPeriodDetails);
      const priorNet = number(priorDetails.reduce((sum,detail) => sum + Number(detail?.net || 0),0));
      add({ periodMonth:batchRow.payment_period_month,amount:number(Number(paymentItem.net_salary || 0) - priorNet),sourceRunId:batchRow.payroll_run_id });
      for (const detail of priorDetails) add({
        periodMonth:String(detail?.periodMonth || ''),amount:number(detail?.net),fallback:{
          gross:number(detail?.gross),deductions:number(detail?.deductions),net:number(detail?.net),
        },
      });
    }
    for (const ref of array(batch.priorEntitlements)) {
      if (ref?.employeeId !== employeeId) continue;
      add({ periodMonth:String(ref.sourcePeriodMonth || ''),amount:number(ref.amount),sourceRunId:String(ref.sourcePayrollRunId || '') });
    }
    for (const coverage of coverages.values()) {
      const sourceRow = (coverage.sourceRunId && rowsByRun.get(coverage.sourceRunId)) || rowsByPeriod.get(coverage.periodMonth);
      let snapshot = safePayrollSnapshot(sourceRow,coverage.periodMonth);
      if (!snapshot && coverage.fallback) snapshot = {
        payrollRunId:null,payrollRunItemId:null,periodMonth:coverage.periodMonth,employeeNo:'',employeeName:'',department:'',
        earnings:{ baseSalary:0,housingAllowance:0,transportAllowance:0,otherAllowances:0,nonGosiAllowances:0,overtimeAmount:0,overtimeHours:0,bonuses:0,manualAddition:0,totalGrossSalary:coverage.fallback.gross },
        deductions:{ delayMinutes:0,delayDeduction:0,absenceDays:0,absenceDeduction:0,unpaidLeaveDays:0,unpaidLeaveDeduction:0,gosiEmployeeShare:0,loanDeduction:0,penaltiesDeduction:0,otherDeductions:0,manualDeduction:0,totalDeductions:coverage.fallback.deductions },
        netSalary:coverage.fallback.net,payableDays:null,adjustmentNotes:'',
      };
      if (!snapshot) continue;
      snapshot.netSalary = coverage.amount;
      payslips.push({
        id:`${batchRow.id}:${coverage.periodMonth}`,periodMonth:coverage.periodMonth,paidAmount:coverage.amount,
        payment:{ batchId:batchRow.id,batchNumber:String(batchRow.batch_number || ''),method:String(batchRow.method || ''),paymentDate:batchRow.payment_date || null,reference:String(batch.reference || batchRow.batch_number || '') },
        snapshot,
      });
    }
  }
  return payslips.sort((a,b) => b.periodMonth.localeCompare(a.periodMonth) || String(b.payment.paymentDate || '').localeCompare(String(a.payment.paymentDate || '')));
}

export function createEmployeePortalRouter({ auth,pool,q }) {
  const router = express.Router();
  const requireEmployee = (req,res) => {
    if (req.user.role !== 'EMPLOYEE') { res.status(403).json({ error:'EMPLOYEE_ROLE_REQUIRED' }); return false; }
    if (!req.user.employee_id) { res.status(409).json({ error:'EMPLOYEE_PORTAL_NOT_LINKED' }); return false; }
    return true;
  };
  const loadPaidPayslips = async req => {
    const params = [req.user.employee_id,req.user.company_ids];
    const batches = await pool.query(`SELECT b.id,b.payroll_run_id,b.batch_number,b.method,b.payment_date::text,b.payload batch_payload,
        r.period_month payment_period_month,
        ARRAY(SELECT bi.employee_id FROM ${q('payroll_payment_batch_items')} bi WHERE bi.payment_batch_id=b.id ORDER BY bi.sort_order) employee_ids
      FROM ${q('payroll_payment_batches')} b JOIN ${q('payroll_runs')} r ON r.id=b.payroll_run_id AND r.company_id=b.company_id
      WHERE b.status='PAID' AND b.company_id=ANY($2::text[]) AND (
        EXISTS (SELECT 1 FROM ${q('payroll_payment_batch_items')} direct_item WHERE direct_item.payment_batch_id=b.id AND direct_item.employee_id=$1)
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(b.payload->'priorEntitlements','[]'::jsonb)) entitlement WHERE entitlement->>'employeeId'=$1)
      ) ORDER BY COALESCE(b.payment_date,b.scheduled_date) DESC,b.sort_order DESC`,params);
    const items = await pool.query(`SELECT i.payroll_run_id,i.id,i.employee_no,i.employee_name,i.base_salary,i.total_gross_salary,
        i.total_deductions,i.net_salary,i.payload,r.period_month
      FROM ${q('payroll_run_items')} i JOIN ${q('payroll_runs')} r ON r.id=i.payroll_run_id
      WHERE i.employee_id=$1 AND r.company_id=ANY($2::text[]) ORDER BY r.period_month DESC`,params);
    return buildEmployeePaidPayslips(batches.rows,items.rows,req.user.employee_id);
  };

  router.get('/employee-portal/me', auth, async (req,res,next) => {
    try {
      if (!requireEmployee(req,res)) return;
      const result = await pool.query(`SELECT e.id,e.company_id,e.employee_no,e.first_name_ar,e.last_name_ar,e.first_name_en,e.last_name_en,
          e.department,e.job_title,e.hire_date::text,e.status,e.payload,
          c.company_code,c.name_ar company_name_ar,c.name_en company_name_en,c.payload company_payload
        FROM ${q('employees')} e JOIN ${q('companies')} c ON c.id=e.company_id AND c.is_archived=false
        WHERE e.id=$1 AND e.company_id=ANY($2::text[]) AND e.is_archived=false LIMIT 1`, [req.user.employee_id,req.user.company_ids]);
      if (!result.rowCount) return res.status(404).json({ error:'EMPLOYEE_PORTAL_PROFILE_NOT_FOUND' });
      const row = result.rows[0];
      const employee = row.payload || {};
      const company = row.company_payload || {};
      res.json({
        profile:{ id:row.id,employeeNo:row.employee_no,firstNameAr:row.first_name_ar,lastNameAr:row.last_name_ar,firstNameEn:row.first_name_en,lastNameEn:row.last_name_en,department:row.department,jobTitle:row.job_title,hireDate:row.hire_date,status:row.status,email:String(employee.email || req.user.email || ''),phone:String(employee.phone || req.user.phone || '') },
        company:{ id:row.company_id,companyCode:row.company_code,nameAr:row.company_name_ar,nameEn:row.company_name_en,logo:typeof company.logo === 'string' ? company.logo : undefined },
        subscription:req.subscription || null,
      });
    } catch (error) { next(error); }
  });

  router.get('/employee-portal/payslips', auth, async (req,res,next) => {
    try {
      if (!requireEmployee(req,res)) return;
      const payslips = await loadPaidPayslips(req);
      res.json({ payslips:payslips.map(({ snapshot,...payslip }) => ({ ...payslip,employeeName:snapshot.employeeName,employeeNo:snapshot.employeeNo,grossSalary:snapshot.earnings.totalGrossSalary,totalDeductions:snapshot.deductions.totalDeductions,netSalary:snapshot.netSalary })) });
    } catch (error) { next(error); }
  });

  router.get('/employee-portal/payslips/:batchId/:periodMonth', auth, async (req,res,next) => {
    try {
      if (!requireEmployee(req,res)) return;
      const payslip = (await loadPaidPayslips(req)).find(item => item.payment.batchId === req.params.batchId && item.periodMonth === req.params.periodMonth);
      if (!payslip) return res.status(404).json({ error:'EMPLOYEE_PAYSLIP_NOT_FOUND' });
      res.json({ payslip });
    } catch (error) { next(error); }
  });
  return router;
}
