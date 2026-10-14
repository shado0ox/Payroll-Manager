const money=value=>Math.round((Number(value)+Number.EPSILON)*100)/100;
export function wholeRiyalLoanPlan(total,months,startMonth){
  if(!Number.isSafeInteger(total)||total<=0||!Number.isInteger(months)||months<1||months>60||total<months
    ||!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth))throw new Error('INVALID_WHOLE_RIYAL_LOAN_PLAN');
  const monthlyInstallment=Math.floor(total/months);
  const finalInstallment=total-monthlyInstallment*(months-1);
  const [year,month]=startMonth.split('-').map(Number);
  return {monthlyInstallment,finalInstallment,installmentRounding:'WHOLE_SAR_LAST',schedule:Array.from({length:months},(_,index)=>{
    const date=new Date(Date.UTC(year,month-1+index,1));
    return {periodMonth:date.toISOString().slice(0,7),amount:index===months-1?finalInstallment:monthlyInstallment};
  })};
}
export function remainingLoanInstallments(loan,balance=loan.remainingAmount){
  balance=money(balance);if(balance<=0)return 0;
  const base=Number(loan.monthlyInstallment);
  if(!(base>0))return Number(loan.remainingInstallments)||0;
  if(loan.installmentRounding!=='WHOLE_SAR_LAST')return Math.ceil(balance/base);
  const last=Number(loan.totalAmount)-base*(Number(loan.totalInstallments)-1);
  return balance<=last?1:Math.ceil(money(balance-last)/base)+1;
}
export function loanInstallmentAmount(loan){
  const balance=money(loan.remainingAmount);
  return remainingLoanInstallments(loan,balance)===1&&loan.installmentRounding==='WHOLE_SAR_LAST'
    ?Math.max(0,balance):Math.min(Number(loan.monthlyInstallment),Math.max(0,balance));
}
export function validateLoanInstallmentPlan(loan){
  if(loan.installmentRounding===undefined)return;
  if(loan.installmentRounding!=='WHOLE_SAR_LAST')throw new Error('INVALID_WHOLE_RIYAL_LOAN_PLAN');
  const plan=wholeRiyalLoanPlan(Number(loan.totalAmount),Number(loan.totalInstallments),loan.startDate);
  if(Number(loan.monthlyInstallment)!==plan.monthlyInstallment)throw new Error('INVALID_WHOLE_RIYAL_LOAN_PLAN');
}
