const rows=value=>Array.isArray(value)?value:[];
const money=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;

// Drafts are independent previews. Approval must not consume more principal than
// exists, including when two months were both calculated before either was approved.
export function validateApprovedPayrollLoans(stored, incomingRuns) {
  const before=new Map(rows(stored?.payrollRuns).map(run=>[run.id,run]));
  const changed=rows(incomingRuns).filter(run=>['APPROVED','POSTED'].includes(run.status)
    && (!['APPROVED','POSTED'].includes(before.get(run.id)?.status)
      || JSON.stringify(rows(run.items).map(item=>[item.employeeId,item.loanDeduction]))
        !==JSON.stringify(rows(before.get(run.id)?.items).map(item=>[item.employeeId,item.loanDeduction]))));
  for(const run of changed){
    for(const item of rows(run.items)){
      if(!(Number(item.loanDeduction)>0))continue;
      const capacity=money(rows(stored.loans).filter(loan=>loan.companyId===run.companyId && loan.employeeId===item.employeeId
        && String(loan.startDate||'').slice(0,7)<=run.periodMonth).reduce((sum,loan)=>sum+Math.max(0,Number(loan.remainingAmount)||0),0));
      const consumed=money(rows(incomingRuns).filter(candidate=>candidate.companyId===run.companyId && ['APPROVED','POSTED'].includes(candidate.status))
        .reduce((sum,candidate)=>sum+rows(candidate.items).filter(row=>row.employeeId===item.employeeId).reduce((sum,row)=>sum+Math.max(0,Number(row.loanDeduction)||0),0),0));
      // Include future approved deductions: approving an older draft must not allow
      // the same loan balance to be used a second time in a different month.
      const allCapacity=money(rows(stored.loans).filter(loan=>loan.companyId===run.companyId && loan.employeeId===item.employeeId)
        .reduce((sum,loan)=>sum+Math.max(0,Number(loan.remainingAmount)||0),0));
      const throughMonth=money(rows(incomingRuns).filter(candidate=>candidate.companyId===run.companyId && candidate.periodMonth<=run.periodMonth
        && ['APPROVED','POSTED'].includes(candidate.status)).reduce((sum,candidate)=>sum+rows(candidate.items).filter(row=>row.employeeId===item.employeeId)
          .reduce((sum,row)=>sum+Math.max(0,Number(row.loanDeduction)||0),0),0));
      if(consumed>allCapacity || throughMonth>capacity){
        const error=new Error('PAYROLL_LOAN_BALANCE_EXCEEDED');error.status=409;throw error;
      }
    }
  }
}
