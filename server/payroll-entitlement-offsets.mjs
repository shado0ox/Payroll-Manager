import { availableSalarySourceBalance, effectiveEmployeeSalaryLoans, salaryMoney } from './payroll-ledger.mjs';
const rows=value=>Array.isArray(value)?value:[];
const fail=code=>{const error=new Error(code);error.status=409;throw error;};

export function buildPayrollEntitlementOffset(stored,run,input,user){
  const item=rows(run.items).find(item=>item.id===input.sourcePayrollItemId&&item.employeeId===input.employeeId);
  if(!item||!['APPROVED','POSTED'].includes(run.status)||['SETTLED','CANCELLED_WITH_DOCUMENT'].includes(item.entitlementStatus))fail('OFFSET_SOURCE_INVALID');
  const reversed=input.reversesOffsetId?rows(run.entitlementOffsets).find(offset=>offset.id===input.reversesOffsetId&&offset.amount>0):null;
  if(input.reversesOffsetId&&(!reversed||reversed.employeeId!==item.employeeId||reversed.sourcePayrollItemId!==item.id
    ||rows(run.entitlementOffsets).some(offset=>offset.reversesOffsetId===reversed.id)))fail('OFFSET_REVERSAL_INVALID');
  const amount=Number(input.amount);
  if(typeof input.id!=='string'||!input.id||!Number.isFinite(amount)||(!reversed&&amount<=0)||(reversed&&amount!==-reversed.amount)||amount!==salaryMoney(amount)
    ||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>2000
    ||typeof input.documentRef!=='string'||!input.documentRef.trim()||input.documentRef.length>200
    ||typeof input.counterAccount!=='string'||!input.counterAccount.trim()||input.counterAccount.length>100
    ||typeof input.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||Number.isNaN(Date.parse(input.date))
    ||new Date(input.date).toISOString().slice(0,10)!==input.date)fail('OFFSET_DOCUMENT_REQUIRED');
  if(rows(run.entitlementOffsets).some(offset=>offset.id===input.id
    ||offset.sourcePayrollItemId===item.id&&String(offset.documentRef).trim().toLowerCase()===input.documentRef.trim().toLowerCase()))fail('OFFSET_DUPLICATE_DOCUMENT');
  const available=availableSalarySourceBalance(stored.payrollRuns,run,item);
  if(!Number.isFinite(available)||(!reversed&&amount>available))fail('OFFSET_EXCEEDS_UNRESERVED_BALANCE');
  const offset={id:input.id,employeeId:item.employeeId,sourcePayrollItemId:item.id,amount,reason:input.reason.trim(),documentRef:input.documentRef.trim(),
    counterAccount:input.counterAccount.trim(),date:input.date,createdAt:new Date().toISOString(),createdBy:String(user?.id||'')};
  if(reversed){offset.reversesOffsetId=reversed.id;offset.counterAccount=reversed.counterAccount;}
  let loan=null;
  const loanId=reversed?reversed.loanId:input.loanId;
  if(loanId){
    const source=effectiveEmployeeSalaryLoans(stored.loans,stored.payrollRuns,run.companyId,item.employeeId).find(loan=>loan.id===loanId);
    const company=rows(stored.companies).find(company=>company.id===run.companyId);
    if(!source||(!reversed&&amount>source.effectiveRemaining)||offset.counterAccount!==(company?.chartOfAccounts?.employeeAdvancesAccount||'1105'))fail('OFFSET_LOAN_BALANCE_INVALID');
    offset.loanId=source.id;offset.loanPriorStatus=reversed?reversed.loanPriorStatus:source.status;
    const {effectiveRemaining,...original}=source;
    const remainingAmount=salaryMoney(Number(original.remainingAmount)-amount);
    loan={...original,remainingAmount,remainingInstallments:remainingAmount===0?0:original.monthlyInstallment>0?Math.ceil(remainingAmount/original.monthlyInstallment):original.remainingInstallments,
      status:remainingAmount===0?'COMPLETED':original.status==='COMPLETED'?(offset.loanPriorStatus||'ACTIVE'):original.status,adjustments:[...rows(original.adjustments),{id:`offset-${offset.id}`,amount:-amount,date:offset.date,
        reason:`${offset.reason} | ${offset.documentRef}`,createdAt:offset.createdAt,createdBy:offset.createdBy}]};
  }
  return {record:{...run,entitlementOffsets:[...rows(run.entitlementOffsets),offset]},offset,loan};
}
