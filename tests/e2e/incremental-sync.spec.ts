import { expect, test } from '@playwright/test';

const login = async (page:any) => {
  await page.goto('/');
  const form = page.locator('form').first();
  await form.locator('input[autocomplete="organization"]').fill('101');
  await form.locator('input[autocomplete="username"]').fill('admin');
  await form.locator('input[autocomplete="current-password"]').fill('TestAdmin1!');
  await Promise.all([
    page.waitForResponse((response:any) => response.url().endsWith('/api/state') && response.ok()),
    form.locator('button[type="submit"]').click(),
  ]);
  await expect(page.getByTestId('nav-employees')).toBeVisible();
};

test('a record saved in one tab reaches another without reloading full state', async ({ browser }) => {
  const context = await browser.newContext();
  const writer = await context.newPage();
  await login(writer);

  const observer = await context.newPage();
  await login(observer);

  let fullStateReads = 0;
  observer.on('request',request => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/state') fullStateReads += 1;
  });
  await observer.waitForTimeout(500);
  fullStateReads = 0;

  const employeeId = `employee-e2e-${Date.now()}`;
  const result = await writer.evaluate(async id => {
    const stateResponse = await fetch('/api/state');
    const current = await stateResponse.json();
    const companyId = current.state.activeCompanyId || current.state.companies[0].id;
    const employeeName = `المزامنة-${id}`;
    const employee = {
      id,companyId,employeeNo:`E2E-${Date.now()}`,status:'ACTIVE',
      firstNameAr:'اختبار',lastNameAr:employeeName,firstNameEn:'Sync',lastNameEn:'Test',
      nationalIdOrIqama:'',department:'QA',jobTitle:'Tester',hireDate:'2026-09-01',salaryStartDate:'2026-09-01',
      salaryPackage:{ baseSalary:1000,housingAllowance:0,transportAllowance:0,otherFixedAllowances:0 },
    };
    const response = await fetch(`/api/employees/${encodeURIComponent(id)}`,{
      method:'PUT',headers:{ 'Content-Type':'application/json' },body:JSON.stringify(employee),
    });
    return { ok:response.ok,status:response.status,employeeName:`اختبار ${employeeName}`,body:await response.json() };
  },employeeId);

  expect(result.ok,JSON.stringify(result.body)).toBe(true);
  await observer.getByTestId('nav-employees').click();
  await expect(observer.locator('tbody').getByText(result.employeeName,{ exact:true })).toBeVisible();
  expect(fullStateReads).toBe(0);

  await observer.getByTestId('nav-loans_penalties').click();
  const financialResult = await writer.evaluate(async employeeId => {
    const stateResponse = await fetch('/api/state');
    const current = await stateResponse.json();
    const companyId = current.state.activeCompanyId || current.state.companies[0].id;
    const now = new Date();
    const periodMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2,'0')}`;
    const date = `${periodMonth}-01`;
    const loanReason = `سلفة متصفح ${employeeId}`;
    const penaltyReason = `جزاء متصفح ${employeeId}`;
    const loan = {
      id:`loan-e2e-${Date.now()}`,companyId,employeeId,totalAmount:500,monthlyInstallment:500,
      totalInstallments:1,remainingInstallments:1,remainingAmount:500,startDate:periodMonth,
      status:'ACTIVE',reason:loanReason,
    };
    const penalty = {
      id:`penalty-e2e-${Date.now()}`,companyId,employeeId,periodMonth,date,
      reason:penaltyReason,amount:100,appliedInPayroll:false,
    };
    const loanResponse = await fetch(`/api/loans/${encodeURIComponent(loan.id)}`,{
      method:'PUT',headers:{ 'Content-Type':'application/json' },body:JSON.stringify(loan),
    });
    const loanBody = await loanResponse.json();
    const penaltyResponse = await fetch(`/api/penalties/${encodeURIComponent(penalty.id)}`,{
      method:'PUT',headers:{ 'Content-Type':'application/json' },body:JSON.stringify(penalty),
    });
    return {
      loan:{ id:loan.id,reason:loanReason,ok:loanResponse.ok,status:loanResponse.status,body:loanBody },
      penalty:{ id:penalty.id,reason:penaltyReason,ok:penaltyResponse.ok,status:penaltyResponse.status,body:await penaltyResponse.json() },
    };
  },employeeId);

  expect(financialResult.loan.ok,JSON.stringify(financialResult.loan.body)).toBe(true);
  expect(financialResult.penalty.ok,JSON.stringify(financialResult.penalty.body)).toBe(true);
  await expect(observer.getByText(financialResult.loan.reason)).toBeVisible();
  await observer.getByRole('button',{ name:/سجل الجزاءات|Penalties & deductions/i }).click();
  await expect(observer.getByText(financialResult.penalty.reason)).toBeVisible();
  expect(fullStateReads).toBe(0);

  const deletionResult = await writer.evaluate(async ({ loanId,penaltyId }) => {
    const loanResponse = await fetch(`/api/loans/${encodeURIComponent(loanId)}`,{ method:'DELETE' });
    const penaltyResponse = await fetch(`/api/penalties/${encodeURIComponent(penaltyId)}`,{ method:'DELETE' });
    return {
      loan:{ ok:loanResponse.ok,status:loanResponse.status,body:await loanResponse.json() },
      penalty:{ ok:penaltyResponse.ok,status:penaltyResponse.status,body:await penaltyResponse.json() },
    };
  },{ loanId:financialResult.loan.id,penaltyId:financialResult.penalty.id });

  expect(deletionResult.loan.ok,JSON.stringify(deletionResult.loan.body)).toBe(true);
  expect(deletionResult.penalty.ok,JSON.stringify(deletionResult.penalty.body)).toBe(true);
  await expect(observer.getByText(financialResult.penalty.reason)).toHaveCount(0);
  await observer.getByRole('button',{ name:/جدول سلف|Employee loans/i }).click();
  await expect(observer.getByText(financialResult.loan.reason)).toHaveCount(0);
  expect(fullStateReads).toBe(0);
  await context.close();
});
