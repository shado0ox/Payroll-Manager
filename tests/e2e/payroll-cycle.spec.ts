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
  await expect(page.getByTestId('nav-payroll_runs')).toBeVisible();
};

test('current-month payroll calculates foreign GOSI and financial inputs without refresh', async ({ page }) => {
  await login(page);
  const seed = await page.evaluate(async () => {
    const stateResponse = await fetch('/api/state');
    const current = await stateResponse.json();
    const companyId = current.state.activeCompanyId || current.state.companies[0].id;
    const now = new Date();
    const periodMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2,'0')}`;
    const date = `${periodMonth}-01`;
    const suffix = `${Date.now()}`;
    const employeeId = `employee-payroll-e2e-${suffix}`;
    const records = [
      [`/api/employees/${employeeId}`,{
        id:employeeId,companyId,employeeNo:`PAY-${suffix}`,status:'ACTIVE',nationality:'NON_SAUDI',gosiEnabled:true,
        firstNameAr:'اختبار',lastNameAr:`راتب-${suffix}`,firstNameEn:'Payroll',lastNameEn:'Test',
        nationalIdOrIqama:`2${suffix.slice(-9)}`,department:'QA',jobTitle:'Tester',hireDate:date,salaryStartDate:date,
        bankName:'Test Bank',bankIban:'SA0000000000000000000000',bankAccountStatus:'ACTIVE',
        salaryPackage:{ baseSalary:1000,housingAllowance:0,transportAllowance:0,otherFixedAllowances:0,customAllowances:[],customDeductions:[] },
      }],
      [`/api/loans/loan-payroll-e2e-${suffix}`,{
        id:`loan-payroll-e2e-${suffix}`,companyId,employeeId,totalAmount:300,monthlyInstallment:300,
        totalInstallments:1,remainingInstallments:1,remainingAmount:300,startDate:periodMonth,status:'ACTIVE',reason:`سلفة مسير ${suffix}`,
      }],
      [`/api/penalties/penalty-payroll-e2e-${suffix}`,{
        id:`penalty-payroll-e2e-${suffix}`,companyId,employeeId,periodMonth,date,reason:`جزاء مسير ${suffix}`,amount:100,appliedInPayroll:true,
      }],
      [`/api/temporary-earnings/earning-payroll-e2e-${suffix}`,{
        id:`earning-payroll-e2e-${suffix}`,companyId,employeeId,periodMonth,date,type:'COMMISSION',amount:200,
        reason:`عمولة مسير ${suffix}`,appliedInPayroll:true,
      }],
    ] as const;
    for (const [path,record] of records) {
      const response = await fetch(path,{ method:'PUT',headers:{ 'Content-Type':'application/json' },body:JSON.stringify(record) });
      if (!response.ok) return { ok:false,path,status:response.status,body:await response.json() };
    }
    return { ok:true,employeeId,periodMonth };
  });

  expect(seed.ok,JSON.stringify(seed)).toBe(true);
  await page.waitForTimeout(300);
  await page.getByTestId('nav-payroll_runs').click();
  await expect(page.getByLabel(/شهر المسير|Payroll month/i)).toHaveValue(seed.periodMonth!);

  let fullStateReads = 0;
  page.on('request',request => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/state') fullStateReads += 1;
  });
  const payrollResponsePromise = page.waitForResponse(response =>
    response.request().method() === 'PUT' && /\/api\/payroll-runs\/[^/]+$/.test(new URL(response.url()).pathname)
  );
  await page.getByRole('button',{ name:/إعادة احتساب المسير آلياً|Recalculate payroll/i }).click();
  const payrollResponse = await payrollResponsePromise;
  const committed = await payrollResponse.json();
  expect(payrollResponse.ok(),JSON.stringify(committed)).toBe(true);
  const item = committed.record.items.find((candidate:any) => candidate.employeeId === seed.employeeId);

  expect(item).toBeTruthy();
  expect(item.baseSalary).toBe(1000);
  expect(item.bonuses).toBe(200);
  expect(item.loanDeduction).toBe(300);
  expect(item.penaltiesDeduction).toBe(100);
  expect(item.gosiEmployeeShare).toBe(0);
  expect(item.gosiEmployerShare).toBe(20);
  expect(item.totalGrossSalary).toBe(1200);
  expect(item.totalDeductions).toBe(400);
  expect(item.netSalary).toBe(800);
  expect(fullStateReads).toBe(0);
});
