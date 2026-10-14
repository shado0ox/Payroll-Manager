import {test,expect} from '@playwright/test';
test('employee added after a posted paid month receives a late payment and an independent accrual supplement',async({page})=>{
 test.setTimeout(90000);await page.goto('/login');const login=page.locator('form').first();
 await login.locator('input[autocomplete="organization"]').fill('101');await login.locator('input[autocomplete="username"]').fill('admin');await login.locator('input[autocomplete="current-password"]').fill('TestAdmin1!');
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/state')&&r.ok()),login.locator('button[type="submit"]').click()]);
 const seed=await page.evaluate(async()=>{
  const state=(await(await fetch('/api/state')).json()).state,companyId=state.activeCompanyId||state.companies[0].id;
  const used=new Set(state.payrollRuns.map((r:any)=>r.periodMonth));let date=new Date(Date.UTC(new Date().getUTCFullYear()-1,0,1));while(used.has(date.toISOString().slice(0,7)))date=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1));
  const period=date.toISOString().slice(0,7),suffix=String(Date.now()),runId=`retro-run-${suffix}`,oldId=`retro-old-${suffix}`,lateId=`retro-late-${suffix}`;
  const write=async(path:string,method:string,record:any)=>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});if(!r.ok)throw Error(`${path}: ${await r.text()}`);return(await r.json()).record;};
  const employee=(id:string,amount:number,index:number)=>({id,companyId,employeeNo:id,status:'ACTIVE',firstNameAr:'اختبار',lastNameAr:id,nationality:'NON_SAUDI',gosiEnabled:false,hireDate:`${period}-01`,salaryStartDate:`${period}-01`,nationalIdOrIqama:`2${String((Number(suffix.slice(-9))+index)%1e9).padStart(9,'0')}`,bankIban:'SA0380000000608010167519',bankName:'Al Rajhi',bankAccountStatus:'ACTIVE',salaryPackage:{baseSalary:amount,housingAllowance:0,transportAllowance:0,otherFixedAllowances:0,customAllowances:[],customDeductions:[]}});
  const old=employee(oldId,1000,0);await write(`/api/employees/${oldId}`,'PUT',old);
  const item={id:`i-${oldId}`,payrollRunId:runId,employeeId:oldId,employeeName:`اختبار ${oldId}`,employeeNo:oldId,nationality:'NON_SAUDI',nationalIdOrIqama:old.nationalIdOrIqama,bankIban:old.bankIban,bankName:old.bankName,baseSalary:1000,housingAllowance:0,transportAllowance:0,otherAllowances:0,overtimeAmount:0,overtimeHours:0,bonuses:0,totalGrossSalary:1000,totalDeductions:0,netSalary:1000,totalCompanyBurden:1000,gosiEmployeeShare:0,gosiEmployerShare:0,loanDeduction:0,penaltiesDeduction:0,otherDeductions:0,absenceDeduction:0,unpaidLeaveDeduction:0,delayDeduction:0,warningFlags:[],entitlementStatus:'PAYABLE'};
  const end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).toISOString().slice(0,10);
  await write(`/api/payroll-runs/${runId}`,'PUT',{id:runId,companyId,periodMonth:period,startDate:`${period}-01`,endDate:end,status:'UNDER_REVIEW',createdAt:new Date().toISOString(),items:[item],paymentBatches:[],totalNetSalaries:1000,totalGrossSalaries:1000,totalDeductions:0,totalCompanyCost:1000});
  await write(`/api/payroll-runs/${runId}/status`,'POST',{status:'APPROVED'});await write(`/api/payroll-runs/${runId}/status`,'POST',{status:'POSTED'});
  const batchId=`retro-batch-${suffix}`;await write(`/api/payroll-runs/${runId}/payment-batches`,'POST',{id:batchId,companyId,payrollRunId:runId,method:'CASH',status:'SCHEDULED',employeeIds:[oldId],totalAmount:1000,scheduledDate:new Date().toISOString().slice(0,10),allocations:[{employeeId:oldId,periodMonth:period,sourcePayrollRunId:runId,sourcePayrollItemId:item.id,amount:1000}]});await write(`/api/payroll-runs/${runId}/payment-batches/${batchId}/status`,'PATCH',{status:'PAID'});
  // Store an isolated posted snapshot; this test makes no external Qoyod request.
  const journal={id:`batch-${runId}`,companyId,payrollRunId:runId,periodMonth:period,batchNumber:`JV-${period.replace('-','')}-001`,date:end,description:'قيد الراتب الأصلي',status:'POSTED',journalType:'PAYROLL_ACCRUAL',totalDebit:1000,totalCredit:1000,lines:[{id:'line-debit-base-CC-DEFAULT',accountCode:'5101',costCenterCode:'CC-GEN',accountNameAr:'مصروف الرواتب',descriptionAr:'الراتب الأصلي',debit:1000,credit:0},{id:'line-cred-salaries-payable',accountCode:'2101',accountNameAr:'مستحقات الرواتب',descriptionAr:'الراتب الأصلي',debit:0,credit:1000}]};
  await write(`/api/journals/${journal.id}`,'PUT',{...journal,qoyodSyncStatus:{synced:true,qoyodJournalId:`ISOLATED-${suffix}`,syncedAt:new Date().toISOString()},qoyodSnapshot:journal});
  await write(`/api/employees/${lateId}`,'PUT',employee(lateId,700,1));return{runId,oldId,lateId,period};
 });
 await page.reload();await page.getByTestId('nav-payroll_runs').click();await page.getByLabel(/السنة|Year/i).selectOption(seed.period.slice(0,4));await page.getByLabel(/شهر المسير|Payroll month/i).selectOption(seed.period);
 const recalculated=page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname===`/api/payroll-runs/${seed.runId}`);
 await page.getByRole('button',{name:/إعادة احتساب المسير آلياً|Recalculate payroll/i}).click();const response=await recalculated;const result=await response.json();expect(response.ok(),JSON.stringify(result)).toBe(true);
 expect(result.record.status).toBe('POSTED');expect(result.record.items.find((i:any)=>i.employeeId===seed.oldId).netSalary).toBe(1000);expect(result.record.items.find((i:any)=>i.employeeId===seed.lateId).netSalary).toBe(700);
 await page.getByRole('button',{name:/تحديد المتاح|Select eligible/i}).click();await page.getByRole('button',{name:/إنشاء دفعة متأخرة|Create late payment batch/i}).click();await page.locator('select:has(option[value="CASH"])').selectOption('CASH');
 const scheduled=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/payroll-runs/${seed.runId}/payment-batches`);
 await page.getByRole('button',{name:/إنشاء وجدولة الدفعة|Create and schedule batch/i}).click();const batchResponse=await scheduled;const scheduledBody=await batchResponse.json();expect(batchResponse.ok(),JSON.stringify(scheduledBody)).toBe(true);expect(scheduledBody.record.paymentBatches.at(-1).totalAmount).toBe(700);
 const paid=page.waitForResponse(r=>r.request().method()==='PATCH'&&/payment-batches\/[^/]+\/status$/.test(new URL(r.url()).pathname));await page.getByRole('button',{name:/تم التحويل|Mark paid/i}).click();expect((await paid).ok()).toBe(true);
 await page.getByTestId('nav-journals').click();await page.getByLabel(/فترة القيد|Journal period/i).selectOption(seed.period);
 const selector=page.getByLabel(/قيد الاستحقاق الأصلي أو التكميلي|Original or supplemental accrual/i);await expect(selector).toHaveValue(`batch-${seed.runId}-supplement-1`);await expect(selector.locator('option')).toHaveCount(2);
 const saved=await page.evaluate(async(runId)=>{const s=(await(await fetch('/api/state')).json()).state;return{run:s.payrollRuns.find((r:any)=>r.id===runId),journal:s.journals.find((j:any)=>j.id===`batch-${runId}`)};},seed.runId);
 expect(saved.run.paymentBatches.reduce((sum:number,b:any)=>sum+(b.status==='PAID'?b.totalAmount:0),0)).toBe(1700);expect(saved.journal.totalDebit).toBe(1000);expect(saved.journal.qoyodSnapshot.totalCredit).toBe(1000);
 const scopes=await page.evaluate(async(seed)=>{
  const state=(await(await fetch('/api/state')).json()).state;const original=state.payrollRuns.find((r:any)=>r.id===seed.runId);const late=original.items.find((i:any)=>i.employeeId===seed.lateId);
  const used=new Set(state.payrollRuns.map((r:any)=>r.periodMonth));const [year,month]=seed.period.split('-').map(Number);let date=new Date(Date.UTC(year,month,1));
  const next=(d:Date)=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1));
  while(used.has(date.toISOString().slice(0,7))||used.has(next(date).toISOString().slice(0,7)))date=next(date);
  const heldPeriod=date.toISOString().slice(0,7),currentPeriod=next(date).toISOString().slice(0,7),heldId=`${seed.runId}-held`,currentId=`${seed.runId}-current`;
  const write=async(path:string,method:string,record:any)=>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});if(!r.ok)throw Error(`${path}: ${await r.text()}`);};
  const heldItem={...late,id:`${heldId}-item`,payrollRunId:heldId,priorPeriodNet:0,priorPeriodGross:0,priorPeriodDeductions:0,priorPeriodDetails:[],netSalary:700,bankIban:'',entitlementStatus:'HELD',entitlementReason:'MISSING_BANK_ACCOUNT',entitlementHoldSource:'MISSING_BANK_ACCOUNT'};
  const currentItem={...late,id:`${currentId}-item`,payrollRunId:currentId,netSalary:1400,priorPeriodNet:700,priorPeriodGross:700,priorPeriodDeductions:0,priorPeriodDetails:[{periodMonth:heldPeriod,gross:700,deductions:0,net:700}],entitlementStatus:'PAYABLE'};
  for(const [id,period,item] of [[heldId,heldPeriod,heldItem],[currentId,currentPeriod,currentItem]] as const){
   const [y,m]=period.split('-').map(Number);
   await write(`/api/payroll-runs/${id}`,'PUT',{...original,id,periodMonth:period,startDate:`${period}-01`,endDate:new Date(Date.UTC(y,m,0)).toISOString().slice(0,10),status:'UNDER_REVIEW',approvedAt:undefined,postedAt:undefined,items:[{...item,totalCompanyBurden:700+Number(item.priorPeriodNet||0)}],paymentBatches:[],entitlementOffsets:[],employeesCount:1,totalBaseSalaries:700,totalCompanyCost:700+Number(item.priorPeriodNet||0),totalGrossSalaries:700+Number(item.priorPeriodGross||0),totalNetSalaries:item.netSalary,totalDeductions:0});
   await write(`/api/payroll-runs/${id}/status`,'POST',{status:'APPROVED'});
  }
  return {heldId,currentId,currentPeriod};
 },seed);
 await page.reload();await page.getByTestId('nav-payroll_runs').click();await page.getByLabel(/السنة|Year/i).selectOption(scopes.currentPeriod.slice(0,4));await page.getByLabel(/شهر المسير|Payroll month/i).selectOption(scopes.currentPeriod);
 await page.getByRole('button',{name:/تحديد المتاح|Select eligible/i}).click();await page.getByRole('button',{name:/إنشاء دفعة للمحددين|Create selected batch/i}).click();
 await expect(page.getByLabel(/مبلغ سداد|Payment amount/i)).toHaveValue('1400');
 await page.getByLabel(/نطاق السداد|Payment scope/i).selectOption('CURRENT_MONTH');await expect(page.getByLabel(/مبلغ سداد|Payment amount/i)).toHaveValue('700');
 await page.locator('select:has(option[value="CASH"])').selectOption('CASH');
 const scopedWrite=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/payroll-runs/${scopes.currentId}/payment-batches`);await page.getByRole('button',{name:/إنشاء وجدولة الدفعة|Create and schedule batch/i}).click();const scopeResponse=await scopedWrite;const scopeBody=await scopeResponse.json();expect(scopeResponse.ok(),JSON.stringify(scopeBody)).toBe(true);
 const scopeBatch=scopeBody.record.paymentBatches.at(-1);expect(scopeBatch.totalAmount).toBe(700);expect(scopeBatch.allocations.map((a:any)=>a.sourcePayrollRunId)).toEqual([scopes.currentId]);
 const scopedPaid=page.waitForResponse(r=>r.request().method()==='PATCH'&&/payment-batches\/[^/]+\/status$/.test(new URL(r.url()).pathname));await page.getByRole('button',{name:/تم التحويل|Mark paid/i}).click();expect((await scopedPaid).ok()).toBe(true);
 const heldAfter=await page.evaluate(async(id)=>{const s=(await(await fetch('/api/state')).json()).state;return s.payrollRuns.find((r:any)=>r.id===id);},scopes.heldId);expect(heldAfter.items[0].netSalary).toBe(700);expect(heldAfter.paymentBatches).toHaveLength(0);
 await page.getByTestId('nav-employees').click();const employeeRow=page.locator('tr').filter({hasText:seed.lateId}).first();await employeeRow.getByTitle(/كشف حساب الموظف وقسيمة الراتب|Employee statement and payslip/).click();const ledger=page.getByTestId('employee-salary-ledger');await expect(ledger).toBeVisible();await expect(ledger.locator('tbody tr')).toHaveCount(5);await expect(ledger.locator('tfoot')).toContainText('700');

});
