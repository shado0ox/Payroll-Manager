import express from 'express';
import { randomUUID } from 'node:crypto';

const number = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const array = value => Array.isArray(value) ? value : [];
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
const normalizeIban = value => String(value || '').replace(/\s/g,'').toUpperCase();
const validSaudiIban = value => {
  const iban = normalizeIban(value);
  if (!/^SA\d{22}$/.test(iban)) return false;
  const rearranged = `${iban.slice(4)}${iban.slice(0,4)}`.replace(/[A-Z]/g, letter => String(letter.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of rearranged) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
};
const safeBankChangeRequest = row => ({
  id:row.id,status:row.status,currentBankName:row.current_bank_name,currentIban:row.current_iban,
  currentSwiftCode:row.current_swift_code,requestedBankName:row.requested_bank_name,requestedIban:row.requested_iban,
  requestedSwiftCode:row.requested_swift_code,employeeReason:row.employee_reason,reviewReason:row.review_reason,
  requestedAt:row.requested_at,reviewedAt:row.reviewed_at,
});

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

export function buildEmployeeAttendanceReport(rows, periodMonth) {
  const records = rows.map(row => {
    const payload = row.payload || {};
    const daysCount = Math.max(0,Number(row.days_count ?? 1));
    const delayMinutes = Math.max(0,Number(payload.calculatedDelayMinutes ?? row.delay_minutes ?? 0));
    const status = String(payload.attendanceStatus || (row.unpaid_leave ? 'LEAVE' : row.absence ? 'ABSENT' : delayMinutes > 0 ? 'LATE' : 'PRESENT'));
    return {
      id:row.id,date:row.record_date,endDate:row.end_date || null,daysCount,delayMinutes,status,
      scheduledStart:String(payload.scheduledStart || ''),scheduledEnd:String(payload.scheduledEnd || ''),
      actualCheckIn:String(payload.actualCheckIn || ''),actualCheckOut:String(payload.actualCheckOut || ''),
      graceMinutes:Math.max(0,Number(payload.graceMinutes || 0)),overtimeHours:number(row.overtime_hours),
      notes:String(row.notes || payload.notes || ''),payrollApproved:Boolean(payload.payrollApproved),
    };
  });
  const countDays = predicate => records.filter(predicate).reduce((sum,row) => sum + row.daysCount,0);
  return {
    periodMonth,
    summary:{
      presentDays:countDays(row => ['PRESENT','LATE'].includes(row.status)),
      lateDays:countDays(row => row.status === 'LATE' || row.delayMinutes > 0),
      totalDelayMinutes:records.reduce((sum,row) => sum + row.delayMinutes,0),
      absenceDays:countDays(row => row.status === 'ABSENT'),
      leaveDays:countDays(row => row.status === 'LEAVE'),
      missingPunchDays:countDays(row => ['MISSING_IN','MISSING_OUT'].includes(row.status)),
      overtimeHours:number(records.reduce((sum,row) => sum + row.overtimeHours,0)),
    },
    records,
  };
}

const leaveDays = (startDate,endDate) => Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
const leaveDaysInYear = (startDate,endDate,year) => {
  const start = startDate > `${year}-01-01` ? startDate : `${year}-01-01`;
  const end = endDate < `${year}-12-31` ? endDate : `${year}-12-31`;
  return end < start ? 0 : leaveDays(start,end);
};
const safeLeave = row => ({
  id:row.id,type:row.leave_type,startDate:row.start_date,endDate:row.end_date,daysCount:Number(row.days_count || 0),
  status:row.status,isPaid:Boolean(row.is_paid),reason:String(row.reason || ''),createdAt:row.created_at || null,
});

export function resolveAnnualLeaveBalance(employee, year) {
  const payload = employee?.payload || employee || {};
  const policy = ['LABOR_LAW','FIXED_30','CUSTOM'].includes(payload.annualLeavePolicy) ? payload.annualLeavePolicy : 'LABOR_LAW';
  const hireDate = String(employee?.hire_date || payload.hireDate || '');
  const customDays = Math.max(0,Math.min(60,Number(payload.annualLeaveEntitlementDays ?? 21)));
  let entitlementDays = customDays;
  if (policy === 'FIXED_30') entitlementDays = 30;
  if (policy === 'LABOR_LAW') {
    const fifthAnniversaryYear = /^\d{4}-\d{2}-\d{2}$/.test(hireDate) ? Number(hireDate.slice(0,4)) + 5 : Number.POSITIVE_INFINITY;
    entitlementDays = year >= fifthAnniversaryYear ? 30 : 21;
  }
  return {
    policy,entitlementDays,
    openingBalanceDays:Math.max(0,Number(payload.annualLeaveOpeningBalance || 0)),
    priorUsedDays:Math.max(0,Number(payload.annualLeavePriorUsedDays || 0)),
  };
}

export function buildEmployeeLeaveReport(rows, annualLeaveConfig, year) {
  const leaves = rows.map(safeLeave);
  const config = typeof annualLeaveConfig === 'number'
    ? { policy:'CUSTOM',entitlementDays:annualLeaveConfig,openingBalanceDays:0,priorUsedDays:0 }
    : annualLeaveConfig;
  const approvedAnnualDays = leaves.filter(item => item.type === 'ANNUAL' && item.status === 'APPROVED')
    .reduce((sum,item) => sum + leaveDaysInYear(item.startDate,item.endDate,year),0);
  const pendingAnnualDays = leaves.filter(item => item.type === 'ANNUAL' && item.status === 'PENDING')
    .reduce((sum,item) => sum + leaveDaysInYear(item.startDate,item.endDate,year),0);
  return {
    year,annualBalance:{ ...config,approvedDays:approvedAnnualDays,pendingDays:pendingAnnualDays,
      availableDays:config.entitlementDays + config.openingBalanceDays - config.priorUsedDays,
      remainingDays:config.entitlementDays + config.openingBalanceDays - config.priorUsedDays - approvedAnnualDays },
    leaves,
  };
}

export function createEmployeePortalRouter({ auth,writeLimiter,pool,q,bumpStateVersion,appendStateAudit,broadcastStateUpdate }) {
  const router = express.Router();
  const writes = writeLimiter || ((_req,_res,next) => next());
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
          e.department,e.job_title,e.hire_date::text,e.status,e.bank_iban,e.payload,
          c.company_code,c.name_ar company_name_ar,c.name_en company_name_en,c.payload company_payload
        FROM ${q('employees')} e JOIN ${q('companies')} c ON c.id=e.company_id AND c.is_archived=false
        WHERE e.id=$1 AND e.company_id=ANY($2::text[]) AND e.is_archived=false LIMIT 1`, [req.user.employee_id,req.user.company_ids]);
      if (!result.rowCount) return res.status(404).json({ error:'EMPLOYEE_PORTAL_PROFILE_NOT_FOUND' });
      const row = result.rows[0];
      const employee = row.payload || {};
      const company = row.company_payload || {};
      res.json({
        profile:{
          id:row.id,employeeNo:row.employee_no,firstNameAr:row.first_name_ar,lastNameAr:row.last_name_ar,
          firstNameEn:row.first_name_en,lastNameEn:row.last_name_en,department:row.department,jobTitle:row.job_title,
          hireDate:row.hire_date,status:row.status,email:String(employee.email || req.user.email || ''),phone:String(employee.phone || req.user.phone || ''),
          nationality:String(employee.nationality || ''),
          contractEndDate:employee.nationality === 'SAUDI' ? String(employee.contractEndDate || '') : '',
          iqamaExpiryDate:employee.nationality === 'NON_SAUDI' ? String(employee.iqamaExpiryDate || '') : '',
          bankName:String(employee.bankName || ''),bankIban:String(row.bank_iban || employee.bankIban || ''),
          bankSwiftCode:String(employee.bankSwiftCode || ''),bankAccountStatus:String(employee.bankAccountStatus || ''),
        },
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

  router.get('/employee-portal/attendance', auth, async (req,res,next) => {
    try {
      if (!requireEmployee(req,res)) return;
      const periodMonth = String(req.query.periodMonth || '');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth)) return res.status(400).json({ error:'INVALID_ATTENDANCE_PERIOD' });
      const params = [req.user.employee_id,req.user.company_ids,periodMonth];
      const [records,periods] = await Promise.all([
        pool.query(`SELECT id,record_date::text,end_date::text,days_count,delay_minutes,absence,unpaid_leave,overtime_hours,notes,payload
          FROM ${q('attendance_records')}
          WHERE employee_id=$1 AND company_id=ANY($2::text[]) AND period_month=$3
          ORDER BY record_date,id`,params),
        pool.query(`SELECT DISTINCT period_month FROM ${q('attendance_records')}
          WHERE employee_id=$1 AND company_id=ANY($2::text[])
          ORDER BY period_month DESC`,params.slice(0,2)),
      ]);
      res.json({ ...buildEmployeeAttendanceReport(records.rows,periodMonth),availableMonths:periods.rows.map(row => row.period_month) });
    } catch (error) { next(error); }
  });

  router.get('/employee-portal/leaves', auth, async (req,res,next) => {
    try {
      if (!requireEmployee(req,res)) return;
      const year = Number(req.query.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2200) return res.status(400).json({ error:'INVALID_LEAVE_YEAR' });
      const params = [req.user.employee_id,req.user.company_ids];
      const [employee,leaves] = await Promise.all([
        pool.query(`SELECT hire_date::text,payload FROM ${q('employees')} WHERE id=$1 AND company_id=ANY($2::text[]) AND is_archived=false LIMIT 1`,params),
        pool.query(`SELECT id,leave_type,start_date::text,end_date::text,days_count,status,is_paid,reason,
            COALESCE(payload->>'createdAt',updated_at::text) created_at
          FROM ${q('leave_requests')} WHERE employee_id=$1 AND company_id=ANY($2::text[])
          ORDER BY start_date DESC,sort_order`,params),
      ]);
      if (!employee.rowCount) return res.status(404).json({ error:'EMPLOYEE_PORTAL_PROFILE_NOT_FOUND' });
      res.json(buildEmployeeLeaveReport(leaves.rows,resolveAnnualLeaveBalance(employee.rows[0],year),year));
    } catch (error) { next(error); }
  });

  router.post('/employee-portal/leaves', auth, writes, async (req,res,next) => {
    const client = await pool.connect();
    try {
      if (!requireEmployee(req,res)) return;
      const type = String(req.body?.type || '');
      const startDate = String(req.body?.startDate || '');
      const endDate = String(req.body?.endDate || '');
      const reason = String(req.body?.reason || '').trim();
      if (!['ANNUAL','SICK','UNPAID','EMERGENCY','MATERNITY'].includes(type)
        || !validDate(startDate) || !validDate(endDate)
        || endDate < startDate || leaveDays(startDate,endDate) > 365 || reason.length > 500) {
        return res.status(400).json({ error:'INVALID_EMPLOYEE_LEAVE_REQUEST' });
      }
      await client.query('BEGIN');
      const employee = await client.query(`SELECT company_id,hire_date::text,payload FROM ${q('employees')}
        WHERE id=$1 AND company_id=ANY($2::text[]) AND is_archived=false FOR UPDATE`,[req.user.employee_id,req.user.company_ids]);
      if (!employee.rowCount) throw Object.assign(new Error('EMPLOYEE_PORTAL_PROFILE_NOT_FOUND'),{ status:404 });
      const companyId = employee.rows[0].company_id;
      const overlap = await client.query(`SELECT 1 FROM ${q('leave_requests')}
        WHERE employee_id=$1 AND company_id=$2 AND status IN ('PENDING','APPROVED')
          AND start_date <= $4::date AND end_date >= $3::date LIMIT 1`,[req.user.employee_id,companyId,startDate,endDate]);
      if (overlap.rowCount) throw Object.assign(new Error('EMPLOYEE_LEAVE_OVERLAP'),{ status:409 });
      const requestedDays = leaveDays(startDate,endDate);
      if (type === 'ANNUAL') {
        const year = Number(startDate.slice(0,4));
        if (endDate.slice(0,4) !== String(year)) throw Object.assign(new Error('ANNUAL_LEAVE_SINGLE_YEAR_REQUIRED'),{ status:400 });
        const balance = await client.query(`SELECT COALESCE(sum(GREATEST(0,LEAST(end_date,$4::date)-GREATEST(start_date,$3::date)+1)),0)::numeric used_days FROM ${q('leave_requests')}
          WHERE employee_id=$1 AND company_id=$2 AND leave_type='ANNUAL' AND status IN ('PENDING','APPROVED')
            AND start_date <= $4::date AND end_date >= $3::date`,[req.user.employee_id,companyId,`${year}-01-01`,`${year}-12-31`]);
        const config = resolveAnnualLeaveBalance(employee.rows[0],year);
        const available = config.entitlementDays + config.openingBalanceDays - config.priorUsedDays;
        if (Number(balance.rows[0]?.used_days || 0) + requestedDays > available) throw Object.assign(new Error('ANNUAL_LEAVE_BALANCE_EXCEEDED'),{ status:409 });
      }
      const id = `employee-leave-${randomUUID()}`;
      const createdAt = new Date().toISOString();
      const record = { id,companyId,employeeId:req.user.employee_id,type,startDate,endDate,daysCount:requestedDays,status:'PENDING',isPaid:type !== 'UNPAID',reason,createdAt,requestedByEmployee:true };
      const sortOrder = Number((await client.query(`SELECT COALESCE(min(sort_order),0)-1 AS sort_order FROM ${q('leave_requests')} WHERE company_id=$1`,[companyId])).rows[0]?.sort_order || 0);
      await client.query(`INSERT INTO ${q('leave_requests')} (id,company_id,employee_id,leave_type,start_date,end_date,days_count,status,is_paid,reason,payload,sort_order,updated_at)
        VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,'PENDING',$8,NULLIF($9,''),$10::jsonb,$11,now())`,[id,companyId,req.user.employee_id,type,startDate,endDate,requestedDays,record.isPaid,reason,JSON.stringify(record),sortOrder]);
      const updated = await bumpStateVersion(client,req.user.id);
      await appendStateAudit(client,q,{ companyIds:[companyId],user:req.user,action:'EMPLOYEE_LEAVE_REQUEST',version:updated.rows[0].version });
      await client.query('COMMIT');
      broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,companyIds:[companyId],changes:[{ collection:'leaves',operation:'upsert',records:[record] }] });
      res.status(201).json({ leave:safeLeave({ id,leave_type:type,start_date:startDate,end_date:endDate,days_count:requestedDays,status:'PENDING',is_paid:record.isPaid,reason,created_at:createdAt }) });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      if (Number.isInteger(error?.status)) return res.status(error.status).json({ error:error.message });
      next(error);
    } finally { client.release(); }
  });

  router.delete('/employee-portal/leaves/:id', auth, writes, async (req,res,next) => {
    const client = await pool.connect();
    try {
      if (!requireEmployee(req,res)) return;
      await client.query('BEGIN');
      const existing = await client.query(`SELECT id,company_id,status FROM ${q('leave_requests')}
        WHERE id=$1 AND employee_id=$2 AND company_id=ANY($3::text[]) FOR UPDATE`,[req.params.id,req.user.employee_id,req.user.company_ids]);
      if (!existing.rowCount) throw Object.assign(new Error('EMPLOYEE_LEAVE_NOT_FOUND'),{ status:404 });
      if (existing.rows[0].status !== 'PENDING') throw Object.assign(new Error('EMPLOYEE_LEAVE_CANCELLATION_LOCKED'),{ status:409 });
      await client.query(`DELETE FROM ${q('leave_requests')} WHERE id=$1`,[req.params.id]);
      const updated = await bumpStateVersion(client,req.user.id);
      await appendStateAudit(client,q,{ companyIds:[existing.rows[0].company_id],user:req.user,action:'EMPLOYEE_LEAVE_CANCEL',version:updated.rows[0].version });
      await client.query('COMMIT');
      broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,companyIds:[existing.rows[0].company_id],changes:[{ collection:'leaves',operation:'delete',ids:[req.params.id] }] });
      res.json({ deleted:true });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      if (Number.isInteger(error?.status)) return res.status(error.status).json({ error:error.message });
      next(error);
    } finally { client.release(); }
  });

  router.get('/employee-portal/bank-change-requests', auth, async (req,res,next) => {
    try {
      if (!requireEmployee(req,res)) return;
      const result = await pool.query(`SELECT * FROM ${q('employee_bank_change_requests')}
        WHERE employee_id=$1 AND company_id=ANY($2::text[]) ORDER BY requested_at DESC LIMIT 20`,
      [req.user.employee_id,req.user.company_ids]);
      res.json({ requests:result.rows.map(safeBankChangeRequest) });
    } catch (error) { next(error); }
  });

  router.post('/employee-portal/bank-change-requests', auth, writes, async (req,res,next) => {
    const client = await pool.connect();
    try {
      if (!requireEmployee(req,res)) return;
      const requestedIban = normalizeIban(req.body?.iban);
      const employeeReason = String(req.body?.reason || '').trim();
      if (!validSaudiIban(requestedIban) || employeeReason.length > 500) {
        return res.status(400).json({ error:'INVALID_SAUDI_IBAN' });
      }
      await client.query('BEGIN');
      const employee = await client.query(`SELECT id,company_id,bank_iban,payload FROM ${q('employees')}
        WHERE id=$1 AND company_id=ANY($2::text[]) AND is_archived=false FOR UPDATE`,[req.user.employee_id,req.user.company_ids]);
      if (!employee.rowCount) throw Object.assign(new Error('EMPLOYEE_PORTAL_PROFILE_NOT_FOUND'),{ status:404 });
      const row = employee.rows[0];
      const pending = await client.query(`SELECT 1 FROM ${q('employee_bank_change_requests')}
        WHERE employee_id=$1 AND status='PENDING' LIMIT 1`,[req.user.employee_id]);
      if (pending.rowCount) throw Object.assign(new Error('BANK_CHANGE_REQUEST_PENDING'),{ status:409 });
      const bankCode = requestedIban.slice(4,6);
      const bank = await client.query(`SELECT name_ar,name_en,swift_code FROM ${q('company_bank_definitions')}
        WHERE company_id=$1 AND iban_bank_code=$2 AND is_active=true LIMIT 1`,[row.company_id,bankCode]);
      if (!bank.rowCount) throw Object.assign(new Error('IBAN_BANK_NOT_CONFIGURED'),{ status:409 });
      const id = `bank-change-${randomUUID()}`;
      const payload = row.payload || {};
      const requestedBankName = String(bank.rows[0].name_ar || bank.rows[0].name_en || '');
      const requestedSwiftCode = String(bank.rows[0].swift_code || '');
      const inserted = await client.query(`INSERT INTO ${q('employee_bank_change_requests')}
        (id,company_id,employee_id,current_bank_name,current_iban,current_swift_code,requested_bank_name,requested_iban,
          requested_swift_code,employee_reason,requested_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[
        id,row.company_id,row.id,String(payload.bankName || ''),String(row.bank_iban || payload.bankIban || ''),
        String(payload.bankSwiftCode || ''),requestedBankName,requestedIban,requestedSwiftCode,employeeReason,req.user.id,
      ]);
      const updated = await bumpStateVersion(client,req.user.id);
      await appendStateAudit(client,q,{ companyIds:[row.company_id],user:req.user,action:'EMPLOYEE_BANK_CHANGE_REQUEST',version:updated.rows[0].version });
      await client.query('COMMIT');
      broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,companyIds:[row.company_id],changes:[] });
      res.status(201).json({ request:safeBankChangeRequest(inserted.rows[0]) });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      if (Number.isInteger(error?.status)) return res.status(error.status).json({ error:error.message });
      next(error);
    } finally { client.release(); }
  });
  return router;
}
