import React, {useEffect,useState} from 'react';
import {api, type EmployeeRegistrationRequest} from '../utils/api';
import {useLanguage} from '../i18n/LanguageContext';
export function EmployeeRegistrationApprovals({companyId}:{companyId:string}) {
  const {language}=useLanguage(); const tr=(ar:string,en:string)=>language==='ar'?ar:en;
  const [requests,setRequests]=useState<EmployeeRegistrationRequest[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=async()=>{setBusy(true);setError('');try{setRequests((await api.employeeRegistrationRequests(companyId)).requests);}catch{setError(tr('تعذر تحميل طلبات التسجيل','Could not load registration requests'));}finally{setBusy(false);}};
  useEffect(()=>{let cancelled=false;setRequests([]);setError('');api.employeeRegistrationRequests(companyId).then(result=>{if(!cancelled)setRequests(result.requests)}).catch(()=>{if(!cancelled)setError(tr('تعذر تحميل طلبات التسجيل','Could not load registration requests'))});return()=>{cancelled=true};},[companyId]);
  const review=async(id:string,decision:'APPROVED'|'REJECTED')=>{
    const reason=decision==='REJECTED'?window.prompt(tr('سبب رفض التسجيل (يمكن للموظف تقديم طلب جديد)','Reason for rejection (employee can reapply)')):'';
    if(decision==='REJECTED'&&!reason?.trim())return;
    if(decision==='APPROVED'&&!window.confirm(tr('هل تأكدت من هوية الموظف والبريد قبل تفعيل حسابه؟','Have you verified the employee identity and email before activating this account?')))return;
    setBusy(true);try{await api.reviewEmployeeRegistration(id,decision,reason||'');await load();}catch{setError(tr('تعذر اعتماد الطلب. حدّث القائمة وحاول مرة أخرى.','Review failed. Refresh and try again.'));}finally{setBusy(false);}
  };
  return <section className="rounded-2xl border border-amber-200 bg-white p-4 space-y-3">
    <div className="flex items-center justify-between gap-3"><h2 className="font-bold text-slate-900">{tr('طلبات تسجيل الموظفين','Employee registration requests')} ({requests.length})</h2><button type="button" disabled={busy} onClick={load} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{tr('تحديث','Refresh')}</button></div>
    <p className="text-xs text-slate-500">{tr('التسجيل والتحقق من البريد لا يفعّلان الحساب. تحقّق من هوية الموظف قبل الموافقة.','Email verification does not activate the account. Verify employee identity before approval.')}</p>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {!requests.length&&!error&&<p className="text-sm text-slate-500">{tr('لا توجد طلبات بانتظار الموافقة','No requests awaiting approval')}</p>}
    {requests.map(row=><div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-bold">{row.employee_name} — {row.employee_no}</p><p className="text-sm text-slate-600" dir="ltr">{row.email} · {row.username}</p></div><div className="flex gap-2"><button disabled={busy} onClick={()=>review(row.id,'APPROVED')} className="rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-50">{tr('موافقة وتفعيل','Approve and activate')}</button><button disabled={busy} onClick={()=>review(row.id,'REJECTED')} className="rounded-lg border border-red-300 px-4 py-2 text-red-700 disabled:opacity-50">{tr('رفض','Reject')}</button></div></div>)}
  </section>;
}
