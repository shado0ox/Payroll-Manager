import {test,expect} from '@playwright/test';
test('archived absconded, final-exit and transfer balances appear without a new salary or duplicate liability',async({page})=>{
 test.setTimeout(90000);
 await page.goto('/login');const form=page.locator('form').first();
 await form.locator('input[autocomplete="organization"]').fill('101');await form.locator('input[autocomplete="username"]').fill('admin');await form.locator('input[autocomplete="current-password"]').fill('TestAdmin1!');
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/state')&&r.ok()),form.locator('button[type="submit"]').click()]);
 const seed=await page.evaluate(async()=>{
  const state=(await(await fetch('/api/state')).json()).state;const companyId=state.activeCompanyId||state.companies[0].id;
  const used=new Set(state.payrollRuns.map((r:any)=>r.periodMonth));let year=new Date().getUTCFullYear()+3;
  while(used.has(`${year}-01`)||used.has(`${year}-02`))year++;
  const sourcePeriod=`${year}-01`,targetPeriod=`${year}-02`,suffix=String(Date.now()),runId=`arch-source-${suffix}`;
  const write=async(path:string,method:string,record:any)=>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});if(!r.ok)throw Error(`${path}: ${await r.text()}`);return(await r.json()).record;};
  const employees=[];const items=[];
  for(let i=0;i<3;i++){
   const id=`arch-${suffix}-${i}`;const employee={id,companyId,employeeNo:id,status:'ACTIVE',firstNameAr:'اختبار',lastNameAr:`أرشفة ${i}`,nationality:'NON_SAUDI',hireDate:`${sourcePeriod}-01`,salaryStartDate:`${sourcePeriod}-01`,nationalIdOrIqama:`2${String((Number(suffix.slice(-9))+i)%1e9).padStart(9,'0')}`,bankIban:'SA0380000000608010167519',bankName:'Al Rajhi',bankAccountStatus:'ACTIVE',salaryPackage:{baseSalary:1000,housingAllowance:0,transportAllowance:0,otherFixedAllowances:0,customAllowances:[],customDeductions:[]}};
   await write(`/api/employees/${id}`,'PUT',employee);employees.push(employee);
   items.push({id:`i-${id}`,payrollRunId:runId,employeeId:id,employeeName:`اختبار أرشفة ${i}`,employeeNo:id,nationality:'NON_SAUDI',nationalIdOrIqama:employee.nationalIdOrIqama,bankIban:employee.bankIban,bankName:employee.bankName,baseSalary:1000,housingAllowance:0,transportAllowance:0,otherAllowances:0,overtimeAmount:0,overtimeHours:0,bonuses:0,totalGrossSalary:1000,totalDeductions:0,netSalary:1000,totalCompanyBurden:1000,gosiEmployeeShare:0,gosiEmployerShare:0,loanDeduction:0,penaltiesDeduction:0,otherDeductions:0,absenceDeduction:0,unpaidLeaveDeduction:0,delayDeduction:0,warningFlags:[],entitlementStatus:'PAYABLE'});
  }
  await write(`/api/payroll-runs/${runId}`,'PUT',{id:runId,companyId,periodMonth:sourcePeriod,startDate:`${sourcePeriod}-01`,endDate:`${sourcePeriod}-31`,status:'UNDER_REVIEW',createdAt:new Date().toISOString(),items,paymentBatches:[],totalNetSalaries:3000,totalGrossSalaries:3000,totalDeductions:0,totalCompanyCost:3000});
  await write(`/api/payroll-runs/${runId}/status`,'POST',{status:'APPROVED'});
  const batchId=`arch-batch-${suffix}`;
  await write(`/api/payroll-runs/${runId}/payment-batches`,'POST',{id:batchId,batchNumber:`ARCH-${suffix}`,companyId,payrollRunId:runId,method:'CASH',status:'SCHEDULED',employeeIds:employees.map(e=>e.id),totalAmount:1200,scheduledDate:new Date().toISOString().slice(0,10),allocations:items.map(item=>({employeeId:item.employeeId,periodMonth:sourcePeriod,sourcePayrollRunId:runId,sourcePayrollItemId:item.id,amount:400}))});
  await write(`/api/payroll-runs/${runId}/payment-batches/${batchId}/status`,'PATCH',{status:'PAID'});
  for(let i=0;i<3;i++)await write(`/api/employees/${employees[i].id}`,'PUT',{...employees[i],status:i===0?'ABSCONDED':'TERMINATED',employmentEndReason:['ABSCONDED','FINAL_EXIT','SPONSOR_TRANSFER'][i],terminationDate:`${sourcePeriod}-31`});
  return {targetPeriod,employeeIds:employees.map(e=>e.id),runId};
 });
 await page.reload();await page.getByTestId('nav-payroll_runs').click();
 await page.getByLabel(/السنة|Year/i).and(page.locator("input")).fill(seed.targetPeriod.slice(0,4));await page.getByLabel(/شهر المسير|Payroll month/i).and(page.locator("input")).fill(seed.targetPeriod);
 const calculate=async()=>{const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&/\/api\/payroll-runs\/[^/]+$/.test(new URL(r.url()).pathname));await page.getByRole('button',{name:/إعادة احتساب المسير آلياً|Recalculate payroll/i}).click();const response=await saved;const result=await response.json();expect(response.ok(),JSON.stringify(result)).toBe(true);return result.record;};
 for(let attempt=0;attempt<2;attempt++){
  const run=await calculate();
  for(const id of seed.employeeIds){const rows=run.items.filter((item:any)=>item.employeeId===id);expect(rows).toHaveLength(1);expect(rows[0].baseSalary).toBe(0);expect(rows[0].totalGrossSalary).toBe(0);expect(rows[0].priorPeriodNet).toBe(600);expect(rows[0].netSalary).toBe(600);expect(rows[0].loanDeduction).toBe(0);expect(rows[0].gosiEmployerShare).toBe(0);}
 }
 const source=await page.evaluate(async(id)=>{const s=(await(await fetch('/api/state')).json()).state;return s.payrollRuns.find((r:any)=>r.id===id);},seed.runId);
 expect(source.items.map((i:any)=>i.netSalary)).toEqual([1000,1000,1000]);
});
