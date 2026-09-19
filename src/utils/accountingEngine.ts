import { Company, PayrollRun, JournalBatch, JournalLine, PayrollPaymentBatch } from '../types';
import { roundAmount } from './payrollEngine';

type GosiBranchBucket = {
  id:string; code:string; name:string; establishmentNumber:string; expenseAccount:string; payableAccount:string;
  employeeShare:number; employerShare:number; employerByCostCenter:Map<string,number>;
};

const monthEnd = (periodMonth:string) => {
  const [year,month] = periodMonth.split('-').map(Number);
  return new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
};
const journalStatus = (run:PayrollRun):JournalBatch['status'] => run.status;
const safeBranchCode = (value:string) => String(value || 'UNASSIGNED').replace(/[^0-9A-Za-z_-]+/g,'-').replace(/^-+|-+$/g,'') || 'UNASSIGNED';

export function balanceJournalLines(lines:JournalLine[],periodMonth:string):{lines:JournalLine[];totalDebit:number;totalCredit:number} {
  const balancedLines = lines.filter(line => line.id !== 'line-balance-adjustment');
  let totalDebit = roundAmount(balancedLines.reduce((sum,line) => sum + Number(line.debit || 0),0));
  let totalCredit = roundAmount(balancedLines.reduce((sum,line) => sum + Number(line.credit || 0),0));
  const difference = roundAmount(totalDebit-totalCredit);
  if (Math.abs(difference) >= 0.01) {
    balancedLines.push({
      id:'line-balance-adjustment',accountCode:'9999',accountNameAr:'حساب تسوية فروقات القيود',accountNameEn:'Journal balancing adjustments',
      descriptionAr:`تسوية تلقائية لفارق قيد شهر ${periodMonth}`,descriptionEn:`Automatic balancing adjustment for ${periodMonth}`,
      debit:difference < 0 ? Math.abs(difference) : 0,credit:difference > 0 ? difference : 0,
    });
    totalDebit = roundAmount(balancedLines.reduce((sum,line) => sum + Number(line.debit || 0),0));
    totalCredit = roundAmount(balancedLines.reduce((sum,line) => sum + Number(line.credit || 0),0));
  }
  return { lines:balancedLines,totalDebit,totalCredit };
}

function finishBatch(batch:Omit<JournalBatch,'lines'|'totalDebit'|'totalCredit'>,lines:JournalLine[]):JournalBatch {
  return { ...batch,...balanceJournalLines(lines,batch.periodMonth) };
}

export function generatePayrollJournalBatch(company:Company,payrollRun:PayrollRun):JournalBatch {
  const accounts = company.chartOfAccounts;
  const costCenters = company.costCenters || [];
  const defaultCCId = costCenters[0]?.id || 'CC-DEFAULT';
  const buckets = new Map<string,{base:number;housing:number;transport:number;overtime:number;other:number}>();
  for (const item of payrollRun.items || []) {
    const ccId = costCenters.some(cc => cc.id === item.costCenterId) ? item.costCenterId : defaultCCId;
    if (!buckets.has(ccId)) buckets.set(ccId,{base:0,housing:0,transport:0,overtime:0,other:0});
    const bucket=buckets.get(ccId)!;
    bucket.base+=Number(item.baseSalary||0); bucket.housing+=Number(item.housingAllowance||0);
    bucket.transport+=Number(item.transportAllowance||0); bucket.overtime+=Number(item.overtimeAmount||0);
    bucket.other+=Number(item.otherAllowances||0)+Number(item.bonuses||0)+Number(item.manualAddition||0);
  }
  const lines:JournalLine[]=[];
  const definitions = [
    ['base','base',accounts.salariesExpenseAccount||'5101','مصروف الرواتب الأساسية','Basic salary expense'],
    ['housing','housing',accounts.housingAllowanceAccount||'5102','مصروف بدل السكن','Housing allowance expense'],
    ['transport','transport',accounts.transportAllowanceAccount||'5103','مصروف بدل النقل','Transport allowance expense'],
    ['overtime','overtime',accounts.overtimeExpenseAccount||'5104','مصروف العمل الإضافي','Overtime expense'],
    ['other','other',accounts.otherAllowancesExpenseAccount||'5105','مصروف البدلات والمكافآت الأخرى','Other allowances and bonuses expense'],
  ] as const;
  for (const [ccId,bucket] of buckets) {
    const cc=costCenters.find(candidate=>candidate.id===ccId)||{code:'CC-GEN',nameAr:'المركز العام',nameEn:'General cost center'};
    for(const [key,idPart,accountCode,nameAr,nameEn] of definitions){const amount=roundAmount(bucket[key]);if(amount<=0)continue;
      lines.push({id:`line-debit-${idPart}-${ccId}`,accountCode,accountNameAr:nameAr,accountNameEn:nameEn,
        descriptionAr:`استحقاق ${nameAr} لشهر ${payrollRun.periodMonth} - ${cc.nameAr}`,descriptionEn:`${nameEn} accrual for ${payrollRun.periodMonth} - ${cc.nameEn||cc.nameAr}`,
        debit:amount,credit:0,costCenterCode:cc.code,costCenterName:cc.nameAr,costCenterNameEn:cc.nameEn||cc.nameAr});}
  }
  const items=payrollRun.items||[];
  const salariesPayable=roundAmount(items.reduce((sum,item)=>sum+Number(item.netSalary||0)+Number(item.gosiEmployeeShare||0),0));
  const loans=roundAmount(items.reduce((sum,item)=>sum+Number(item.loanDeduction||0),0));
  const otherDeductions=roundAmount(items.reduce((sum,item)=>sum+Math.max(0,Number(item.totalDeductions||0)-Number(item.gosiEmployeeShare||0)-Number(item.loanDeduction||0)),0));
  if(salariesPayable>0)lines.push({id:'line-cred-salaries-payable',accountCode:accounts.salariesPayableAccount||'2101',accountNameAr:'مستحقات الرواتب والأجور',accountNameEn:'Salaries and wages payable',descriptionAr:`صافي الرواتب قبل قيد استحقاق التأمينات لشهر ${payrollRun.periodMonth}`,descriptionEn:`Payroll payable before the separate GOSI accrual for ${payrollRun.periodMonth}`,debit:0,credit:salariesPayable});
  if(loans>0)lines.push({id:'line-cred-loans',accountCode:accounts.employeeAdvancesAccount||'1105',accountNameAr:'ذمم وسلف الموظفين المستردة',accountNameEn:'Employee loans and advances recovered',descriptionAr:`استقطاع السلف لشهر ${payrollRun.periodMonth}`,descriptionEn:`Employee loan deductions for ${payrollRun.periodMonth}`,debit:0,credit:loans});
  if(otherDeductions>0)lines.push({id:'line-cred-penalties',accountCode:accounts.penaltiesPayableAccount||'2105',accountNameAr:'أمانات الجزاءات والخصومات الإدارية',accountNameEn:'Penalties and administrative deductions payable',descriptionAr:`خصومات غير التأمينات لشهر ${payrollRun.periodMonth}`,descriptionEn:`Non-GOSI deductions for ${payrollRun.periodMonth}`,debit:0,credit:otherDeductions});
  return finishBatch({id:`batch-${payrollRun.id}`,companyId:company.id,payrollRunId:payrollRun.id,periodMonth:payrollRun.periodMonth,batchNumber:`JV-${payrollRun.periodMonth.replace('-','')}-${company.crNumber.slice(-4)||'001'}`,date:monthEnd(payrollRun.periodMonth),description:`قيد استحقاق رواتب وأجور موظفي (${company.nameAr}) لشهر ${payrollRun.periodMonth}`,descriptionEn:`Payroll accrual for ${company.nameEn||company.nameAr} - ${payrollRun.periodMonth}`,journalType:'PAYROLL_ACCRUAL',affectedBranches:[],status:journalStatus(payrollRun)},lines);
}

function collectGosiBranches(company:Company,payrollRun:PayrollRun):GosiBranchBucket[] {
  const branches=new Map<string,GosiBranchBucket>();
  for(const item of payrollRun.items||[]){const employeeShare=roundAmount(Number(item.gosiEmployeeShare||0)),employerShare=roundAmount(Number(item.gosiEmployerShare||0));if(employeeShare<=0&&employerShare<=0)continue;
    const id=item.gosiBranchId||'UNASSIGNED';if(!branches.has(id))branches.set(id,{id,code:item.gosiBranchCode||'UNASSIGNED',name:item.gosiBranchName||'غير مربوط بفرع تأمينات',establishmentNumber:item.gosiEstablishmentNumber||'',expenseAccount:item.gosiEmployerExpenseAccount||company.chartOfAccounts.gosiEmployerExpenseAccount||'5106',payableAccount:item.gosiPayableAccount||company.chartOfAccounts.gosiPayableAccount||'2102',employeeShare:0,employerShare:0,employerByCostCenter:new Map()});
    const branch=branches.get(id)!;branch.employeeShare=roundAmount(branch.employeeShare+employeeShare);branch.employerShare=roundAmount(branch.employerShare+employerShare);branch.employerByCostCenter.set(item.costCenterId,roundAmount((branch.employerByCostCenter.get(item.costCenterId)||0)+employerShare));}
  return [...branches.values()].sort((a,b)=>a.code.localeCompare(b.code));
}

export function generateGosiAccrualJournalBatches(company:Company,payrollRun:PayrollRun):JournalBatch[] {
  return collectGosiBranches(company,payrollRun).map(branch=>{const lines:JournalLine[]=[];
    for(const [ccId,amount] of branch.employerByCostCenter){if(amount<=0)continue;const cc=company.costCenters?.find(candidate=>candidate.id===ccId);lines.push({id:`line-gosi-expense-${branch.id}-${ccId||'general'}`,accountCode:branch.expenseAccount,accountNameAr:'مصروف التأمينات الاجتماعية - حصة المنشأة',accountNameEn:'GOSI expense - employer share',descriptionAr:`حصة المنشأة في تأمينات ${branch.name} لشهر ${payrollRun.periodMonth}`,descriptionEn:`Employer GOSI share for ${branch.name} - ${payrollRun.periodMonth}`,debit:amount,credit:0,...(cc?{costCenterCode:cc.code,costCenterName:cc.nameAr,costCenterNameEn:cc.nameEn}:{})});}
    if(branch.employeeShare>0)lines.push({id:`line-gosi-employee-${branch.id}`,accountCode:company.chartOfAccounts.salariesPayableAccount||'2101',accountNameAr:'مستحقات الرواتب والأجور',accountNameEn:'Salaries and wages payable',descriptionAr:`حصة الموظفين في تأمينات ${branch.name} لشهر ${payrollRun.periodMonth}`,descriptionEn:`Employee GOSI share for ${branch.name} - ${payrollRun.periodMonth}`,debit:branch.employeeShare,credit:0});
    const total=roundAmount(branch.employeeShare+branch.employerShare);lines.push({id:`line-gosi-payable-${branch.id}`,accountCode:branch.payableAccount,accountNameAr:`مستحقات التأمينات - ${branch.name}`,accountNameEn:`GOSI payable - ${branch.name}`,descriptionAr:`إجمالي استحقاق تأمينات ${branch.name} لشهر ${payrollRun.periodMonth}`,descriptionEn:`Total GOSI payable for ${branch.name} - ${payrollRun.periodMonth}`,debit:0,credit:total});
    const code=safeBranchCode(branch.code);return finishBatch({id:`batch-gosi-${payrollRun.id}-${branch.id}`,companyId:company.id,payrollRunId:payrollRun.id,periodMonth:payrollRun.periodMonth,batchNumber:`JV-GOSI-${code}-${payrollRun.periodMonth.replace('-','')}`,date:monthEnd(payrollRun.periodMonth),description:`قيد استحقاق تأمينات ${branch.name} لشهر ${payrollRun.periodMonth}`,descriptionEn:`GOSI accrual for ${branch.name} - ${payrollRun.periodMonth}`,journalType:'GOSI_ACCRUAL',gosiBranchId:branch.id,gosiBranchCode:code,gosiBranchName:branch.name,affectedBranches:[branch.id],status:journalStatus(payrollRun)},lines);});
}

export function generatePaymentJournalBatch(company:Company,payrollRun:PayrollRun,paymentBatch?:PayrollPaymentBatch):JournalBatch {
  const paidBatches=payrollRun.paymentBatches?.filter(batch=>batch.status==='PAID')||[];
  const amount=roundAmount(paymentBatch?paymentBatch.totalAmount:payrollRun.paymentBatches?.length?paidBatches.reduce((sum,batch)=>sum+batch.totalAmount,0):payrollRun.totalNetSalaries);
  const reference=paymentBatch?.batchNumber||`مسير ${payrollRun.periodMonth}`;
  const lines:JournalLine[]=[{id:'line-pay-debit-payable',accountCode:company.chartOfAccounts.salariesPayableAccount||'2101',accountNameAr:'مستحقات الرواتب والأجور',accountNameEn:'Salaries and wages payable',descriptionAr:`صرف رواتب شهر ${payrollRun.periodMonth} - دفعة ${reference}`,descriptionEn:`Salary payment for ${payrollRun.periodMonth}`,debit:amount,credit:0},{id:'line-pay-cred-bank',accountCode:company.chartOfAccounts.bankAccount||'1010',accountNameAr:'حساب البنك الجاري',accountNameEn:'Current bank account',descriptionAr:`تحويل رواتب شهر ${payrollRun.periodMonth} - دفعة ${reference}`,descriptionEn:`Salary transfer for ${payrollRun.periodMonth}`,debit:0,credit:amount}];
  return finishBatch({id:`batch-payment-${paymentBatch?.id||payrollRun.id}`,companyId:company.id,payrollRunId:payrollRun.id,periodMonth:payrollRun.periodMonth,batchNumber:`PV-${paymentBatch?.batchNumber||`${payrollRun.periodMonth.replace('-','')}-${company.crNumber.slice(-4)||'001'}`}`,date:paymentBatch?.paymentDate||paymentBatch?.scheduledDate||monthEnd(payrollRun.periodMonth),description:`قيد صرف رواتب شهر ${payrollRun.periodMonth} - دفعة ${reference}`,descriptionEn:`Salary payment journal for ${payrollRun.periodMonth}`,journalType:'PAYROLL_PAYMENT',affectedBranches:[],status:journalStatus(payrollRun)},lines);
}

export function generateGosiPaymentJournalBatches(company:Company,payrollRun:PayrollRun):JournalBatch[] {
  return collectGosiBranches(company,payrollRun).map(branch=>{const total=roundAmount(branch.employeeShare+branch.employerShare),code=safeBranchCode(branch.code);const lines:JournalLine[]=[{id:`line-gosi-payment-debit-${branch.id}`,accountCode:branch.payableAccount,accountNameAr:`مستحقات التأمينات - ${branch.name}`,accountNameEn:`GOSI payable - ${branch.name}`,descriptionAr:`سداد تأمينات ${branch.name} لشهر ${payrollRun.periodMonth}`,descriptionEn:`GOSI payment for ${branch.name} - ${payrollRun.periodMonth}`,debit:total,credit:0},{id:`line-gosi-payment-bank-${branch.id}`,accountCode:company.chartOfAccounts.bankAccount||'1010',accountNameAr:'حساب البنك الجاري',accountNameEn:'Current bank account',descriptionAr:`صرف تأمينات ${branch.name} لشهر ${payrollRun.periodMonth}`,descriptionEn:`GOSI bank payment for ${branch.name} - ${payrollRun.periodMonth}`,debit:0,credit:total}];return finishBatch({id:`batch-gosi-payment-${payrollRun.id}-${branch.id}`,companyId:company.id,payrollRunId:payrollRun.id,periodMonth:payrollRun.periodMonth,batchNumber:`PV-GOSI-${code}-${payrollRun.periodMonth.replace('-','')}`,date:monthEnd(payrollRun.periodMonth),description:`قيد صرف تأمينات ${branch.name} لشهر ${payrollRun.periodMonth}`,descriptionEn:`GOSI payment for ${branch.name} - ${payrollRun.periodMonth}`,journalType:'GOSI_PAYMENT',gosiBranchId:branch.id,gosiBranchCode:code,gosiBranchName:branch.name,affectedBranches:[branch.id],status:journalStatus(payrollRun)},lines);});
}

export function mergeFreshJournalWithDraft(fresh:JournalBatch,persisted?:JournalBatch):JournalBatch {
  if(!persisted)return fresh;
  if(persisted.qoyodSyncStatus?.synced)return persisted.qoyodSnapshot?{...persisted,...persisted.qoyodSnapshot,lines:persisted.qoyodSnapshot.lines}:persisted;
  const removed=new Set(persisted.removedLineIds||[]),overrides=persisted.manualLineOverrides||{};
  const lines=fresh.lines.filter(line=>!removed.has(line.id)).map(line=>({...line,...(overrides[line.id]||{}),id:line.id}));lines.push(...(persisted.customLines||[]));
  return {...fresh,...balanceJournalLines(lines,fresh.periodMonth),manualLineOverrides:overrides,customLines:persisted.customLines||[],removedLineIds:persisted.removedLineIds||[],qoyodSyncStatus:persisted.qoyodSyncStatus};
}

export function buildJournalDraft(fresh:JournalBatch,editedLines:JournalLine[],reason:string):JournalBatch {
  const freshById=new Map(fresh.lines.map(line=>[line.id,line])),editedIds=new Set(editedLines.map(line=>line.id));const manualLineOverrides:Record<string,Partial<JournalLine>>={},customLines:JournalLine[]=[];
  for(const line of editedLines){const original=freshById.get(line.id);if(!original){customLines.push(line);continue;}const changes:Partial<JournalLine>={};for(const key of ['accountCode','accountNameAr','accountNameEn','descriptionAr','descriptionEn','debit','credit','costCenterCode','costCenterName','costCenterNameEn','contactName'] as const){if(line[key]!==original[key])(changes as any)[key]=line[key];}if(Object.keys(changes).length)manualLineOverrides[line.id]=changes;}
  const removedLineIds=fresh.lines.filter(line=>!editedIds.has(line.id)).map(line=>line.id);
  return {...fresh,...balanceJournalLines(editedLines,fresh.periodMonth),manualLineOverrides,customLines,removedLineIds,changeReason:reason};
}
