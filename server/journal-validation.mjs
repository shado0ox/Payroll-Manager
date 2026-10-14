// Validate financial lines in integer halalas; balancing never invents an entry.
export function validateBalancedJournal(batch) {
  if (!Array.isArray(batch?.lines) || !batch.lines.length) return {valid:false,error:'EMPTY_JOURNAL'};
  let debitCents=0,creditCents=0;
  const ids=new Set();
  for (const line of batch.lines) {
    const debit=Number(line?.debit),credit=Number(line?.credit);
    if (!line?.id || ids.has(line.id) || !String(line.accountCode||'').trim()
      || !Number.isFinite(debit) || !Number.isFinite(credit) || debit<0 || credit<0
      || (debit>0&&credit>0) || (!debit&&!credit)
      || Math.abs(debit*100-Math.round(debit*100))>0.00001 || Math.abs(credit*100-Math.round(credit*100))>0.00001) {
      return {valid:false,error:'INVALID_JOURNAL_LINE'};
    }
    ids.add(line.id);debitCents+=Math.round(debit*100);creditCents+=Math.round(credit*100);
  }
  const totals=[Number(batch.totalDebit),Number(batch.totalCredit)];
  const valid=debitCents===creditCents&&totals.every(value=>Number.isFinite(value)&&Math.abs(value*100-Math.round(value*100))<0.00001)
    &&Math.round(totals[0]*100)===debitCents&&Math.round(totals[1]*100)===creditCents;
  return {valid,error:valid?null:'UNBALANCED_JOURNAL',debitTotal:debitCents/100,creditTotal:creditCents/100};
}
