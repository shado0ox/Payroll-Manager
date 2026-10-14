import {CalendarInput} from './CalendarInput';
import React, { useMemo, useState } from 'react';
import { monthlySalaryAccountReport } from '../../server/payroll-ledger.mjs';
import { Company, PayrollRun, PayrollSettlement } from '../types';
import { getCurrentDate } from '../utils/period';
import { formatSAR } from '../utils/payrollEngine';
import { downloadCsvFile } from '../utils/exportUtils';
import { useLanguage } from '../i18n/LanguageContext';

export function SalaryAccountsView({company,payrollRuns,settlements=[]}:{company:Company;payrollRuns:PayrollRun[];settlements?:PayrollSettlement[]}) {
  const {language}=useLanguage();
  const ui=(ar:string,en:string)=>language==='ar'?ar:en;
  const companyRuns=useMemo(()=>payrollRuns.filter(run=>run.companyId===company.id),[payrollRuns,company.id]);
  const [entitlementPeriod,setEntitlementPeriod]=useState(getCurrentDate(company.timezone||'Asia/Riyadh').slice(0,7));
  const [entitlementCenter,setEntitlementCenter]=useState('ALL');
  const [onlyOutstanding,setOnlyOutstanding]=useState(false);
  const entitlementRows=useMemo(()=>monthlySalaryAccountReport(companyRuns,company.id,entitlementPeriod,settlements),[companyRuns,company.id,entitlementPeriod,settlements]);
  const visibleEntitlements=entitlementRows.filter(row=>(entitlementCenter==='ALL'||row.costCenterId===entitlementCenter)&&(!onlyOutstanding||row.closing!==0));
  const csvCell=(value:unknown)=>'"'+String(value??'').replace(/^[=+@-]/,'\t$&').replace(/"/g,'""')+'"';
  const reportColumns=[ui('الموظف','Employee'),ui('الاسم','Name'),ui('مركز التكلفة','Cost center'),ui('رصيد أول الشهر','Opening balance'),ui('استحقاق الشهر','Monthly wages'),ui('صرف','Payments'),ui('تسويات','Offsets'),ui('عكس تسويات','Reversals'),ui('إجمالي مدين','Total debit'),ui('إجمالي دائن','Total credit'),ui('رصيد آخر الشهر','Closing balance')];
  const exportEntitlements=()=>downloadCsvFile(`Salary_Account_${entitlementPeriod}.csv`,[
    [ui('الشهر','Month'),...reportColumns],
    ...visibleEntitlements.map(row=>[entitlementPeriod,row.employeeNo,row.employeeName,company.costCenters?.find(cc=>cc.id===row.costCenterId)?.nameAr||row.costCenterId,row.opening,row.wages,row.paid,row.offsets,row.reversals,row.debit,row.credit,row.closing]),
  ].map(row=>row.map(csvCell).join(',')).join('\r\n'));

  return (
      <section data-testid="outstanding-salary-report" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">{ui('كشف حساب الرواتب المستحقة','Monthly salary account for all employees')}</h2><button onClick={exportEntitlements} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white">{ui('تصدير كشف الحساب CSV','Export salary account CSV')}</button></div>
        <p className="text-xs text-slate-500">{ui('رصيد آخر الشهر = رصيد أول الشهر + الدائن − المدين. يشمل الموظفين المؤرشفين؛ الصرف يُسجل بتاريخ التحويل الفعلي، والدفعات المجدولة لا تُعد صرفًا.','Closing balance = opening balance + credit − debit. Includes archived employees; payments use actual payment dates. Scheduled payments are not cash movements.')}</p>
        <div className="flex flex-wrap gap-4 text-xs">
          <label>{ui('شهر كشف الحساب','Statement month')}<CalendarInput aria-label={ui('شهر كشف الحساب','Statement month')} type="month" className="ms-2 rounded border p-2" value={entitlementPeriod} onChange={event=>{if(event.target.value)setEntitlementPeriod(event.target.value);}}/></label>
          <label>{ui('مركز التكلفة','Cost center')}<select className="ms-2 rounded border p-2" value={entitlementCenter} onChange={event=>setEntitlementCenter(event.target.value)}><option value="ALL">{ui('كل المراكز','All centers')}</option>{company.costCenters?.map(cc=><option key={cc.id} value={cc.id}>{language==='ar'?cc.nameAr:cc.nameEn||cc.nameAr}</option>)}</select></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={onlyOutstanding} onChange={event=>setOnlyOutstanding(event.target.checked)}/>{ui('أرصدة غير صفرية فقط','Nonzero closing balances only')}</label>
          <span className="font-bold">{ui('إجمالي الرصيد المرحّل للتالي','Total carried forward')}: {formatSAR(visibleEntitlements.reduce((sum,row)=>sum+row.closing,0))}</span>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-xs"><thead><tr className="bg-slate-100">{reportColumns.map(label=><th key={label} className="p-2 text-start">{label}</th>)}</tr></thead><tbody>{visibleEntitlements.map(row=><tr key={row.employeeId} className="border-t"><td className="p-2">{row.employeeNo}</td><td>{row.employeeName}</td><td>{company.costCenters?.find(cc=>cc.id===row.costCenterId)?.nameAr||'—'}</td>{[row.opening,row.wages,row.paid,row.offsets,row.reversals,row.debit,row.credit,row.closing].map((amount,index)=><td key={index} className={index===7?'font-bold text-emerald-800':''}>{formatSAR(amount)}</td>)}</tr>)}</tbody><tfoot><tr className="border-t bg-slate-100 font-bold"><td colSpan={3} className="p-2">{ui('الإجمالي','Total')}</td>{(['opening','wages','paid','offsets','reversals','debit','credit','closing'] as const).map(key=><td key={key}>{formatSAR(visibleEntitlements.reduce((sum,row)=>sum+row[key],0))}</td>)}</tr></tfoot></table>{!visibleEntitlements.length&&<p className="p-4 text-center text-sm text-slate-500">{ui('لا توجد أرصدة أو حركات حسب الاختيار.','No balances or movements match these filters.')}</p>}</div>
      </section>
  );
}
