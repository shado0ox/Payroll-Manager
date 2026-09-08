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
    const employee = {
      id,companyId,employeeNo:`E2E-${Date.now()}`,status:'ACTIVE',
      firstNameAr:'اختبار',lastNameAr:'المزامنة',firstNameEn:'Sync',lastNameEn:'Test',
      nationalIdOrIqama:'',department:'QA',jobTitle:'Tester',hireDate:'2026-09-01',salaryStartDate:'2026-09-01',
      salaryPackage:{ baseSalary:1000,housingAllowance:0,transportAllowance:0,otherFixedAllowances:0 },
    };
    const response = await fetch(`/api/employees/${encodeURIComponent(id)}`,{
      method:'PUT',headers:{ 'Content-Type':'application/json' },body:JSON.stringify(employee),
    });
    return { ok:response.ok,status:response.status,body:await response.json() };
  },employeeId);

  expect(result.ok,JSON.stringify(result.body)).toBe(true);
  await expect(observer.getByTestId('nav-employees')).toContainText('(1)');
  expect(fullStateReads).toBe(0);

  await observer.getByTestId('nav-employees').click();
  await expect(observer.getByText('اختبار المزامنة')).toBeVisible();
  await context.close();
});
