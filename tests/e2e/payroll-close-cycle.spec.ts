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

const waitForPayrollWrite = (page:any, method:string, path:RegExp) => page.waitForResponse((response:any) =>
  response.request().method() === method && path.test(new URL(response.url()).pathname) && response.ok()
);

test('paid loan is excluded next month and posted payslip keeps the selected period', async ({ page }) => {
  await login(page);
  const seed = await page.evaluate(async () => {
    const current = await (await fetch('/api/state')).json();
    const companyId = current.state.activeCompanyId || current.state.companies[0].id;
    const now = new Date();
    const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2,'0')}`;
    const nextDate = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth() + 1,1));
    const nextPeriod = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2,'0')}`;
    const suffix = `${Date.now()}`;
    const employeeId = `employee-close-e2e-${suffix}`;
    const employeeNo = `CLOSE-${suffix}`;
    const records = [
      [`/api/employees/${employeeId}`,{
        id:employeeId,companyId,employeeNo,status:'ACTIVE',nationality:'NON_SAUDI',gosiEnabled:true,
        firstNameAr:'اختبار',lastNameAr:`إقفال-${suffix}`,firstNameEn:'Close',lastNameEn:'Cycle',
        nationalIdOrIqama:`2${suffix.slice(-9)}`,department:'QA',jobTitle:'Tester',hireDate:`${currentPeriod}-01`,salaryStartDate:`${currentPeriod}-01`,
        bankName:'Test Bank',bankIban:'SA0000000000000000000000',bankAccountStatus:'ACTIVE',
        salaryPackage:{ baseSalary:1000,housingAllowance:0,transportAllowance:0,otherFixedAllowances:0,customAllowances:[],customDeductions:[] },
      }],
      [`/api/loans/loan-close-e2e-${suffix}`,{
        id:`loan-close-e2e-${suffix}`,companyId,employeeId,totalAmount:300,monthlyInstallment:300,
        totalInstallments:1,remainingInstallments:1,remainingAmount:300,startDate:currentPeriod,status:'ACTIVE',reason:`سلفة إقفال ${suffix}`,
      }],
    ] as const;
    for (const [path,record] of records) {
      const response = await fetch(path,{ method:'PUT',headers:{ 'Content-Type':'application/json' },body:JSON.stringify(record) });
      if (!response.ok) return { ok:false,path,status:response.status,body:await response.json() };
    }
    return { ok:true,employeeId,employeeNo,currentPeriod,nextPeriod };
  });

  expect(seed.ok,JSON.stringify(seed)).toBe(true);
  await page.waitForTimeout(300);
  await page.getByTestId('nav-payroll_runs').click();
  await expect(page.getByLabel(/شهر المسير|Payroll month/i)).toHaveValue(seed.currentPeriod!);

  const initialCalculation = waitForPayrollWrite(page,'PUT',/\/api\/payroll-runs\/[^/]+$/);
  await page.getByRole('button',{ name:/إعادة احتساب المسير آلياً|Recalculate payroll/i }).click();
  const currentRun = (await (await initialCalculation).json()).record;
  expect(currentRun.items.find((item:any) => item.employeeId === seed.employeeId)?.loanDeduction).toBe(300);

  const submitReview = waitForPayrollWrite(page,'POST',/\/api\/payroll-runs\/[^/]+\/status$/);
  await page.getByRole('button',{ name:/إرسال للمراجعة والتدقيق|Submit for review/i }).click();
  expect((await (await submitReview).json()).record.status).toBe('UNDER_REVIEW');

  const approve = waitForPayrollWrite(page,'POST',/\/api\/payroll-runs\/[^/]+\/status$/);
  await page.getByRole('button',{ name:/اعتماد المدير العام|General manager approval/i }).click();
  expect((await (await approve).json()).record.status).toBe('APPROVED');

  const search = page.getByPlaceholder(/بحث بالاسم، الرقم الوظيفي|Search by name/i);
  await search.fill(seed.employeeNo!);
  await page.getByRole('button',{ name:/تحديد المتاح|Select eligible/i }).click();
  await page.getByRole('button',{ name:/إنشاء دفعة للمحددين|Create selected batch/i }).click();
  await page.getByLabel(/طريقة التحويل|Payment method/i).selectOption('CASH');
  const createBatch = waitForPayrollWrite(page,'POST',/\/api\/payroll-runs\/[^/]+\/payment-batches$/);
  await page.getByRole('button',{ name:/إنشاء وجدولة الدفعة|Create and schedule batch/i }).click();
  expect((await (await createBatch).json()).record.paymentBatches.at(-1)?.status).toBe('SCHEDULED');

  const markPaid = waitForPayrollWrite(page,'PATCH',/\/api\/payroll-runs\/[^/]+\/payment-batches\/[^/]+\/status$/);
  await page.getByRole('button',{ name:/تم التحويل|Mark paid/i }).click();
  expect((await (await markPaid).json()).record.paymentBatches.at(-1)?.status).toBe('PAID');

  const post = waitForPayrollWrite(page,'POST',/\/api\/payroll-runs\/[^/]+\/status$/);
  await page.getByRole('button',{ name:/إقفال وترحيل المسير بعد المعالجة|Close and post payroll/i }).click();
  expect((await (await post).json()).record.status).toBe('POSTED');

  const nextYear = seed.nextPeriod!.slice(0,4);
  await page.getByLabel(/السنة|Year/i).selectOption(nextYear);
  await page.getByLabel(/شهر المسير|Payroll month/i).selectOption(seed.nextPeriod!);
  const nextCalculation = waitForPayrollWrite(page,'PUT',/\/api\/payroll-runs\/[^/]+$/);
  await page.getByRole('button',{ name:/إعادة احتساب المسير آلياً|Recalculate payroll/i }).click();
  const nextRun = (await (await nextCalculation).json()).record;
  expect(nextRun.items.find((item:any) => item.employeeId === seed.employeeId)?.loanDeduction).toBe(0);

  await search.fill(seed.employeeNo!);
  const employeeRow = page.locator('tr').filter({ hasText:seed.employeeNo! });
  await employeeRow.locator('button').last().click();
  await expect(page.getByText(seed.nextPeriod!,{ exact:true })).toBeVisible();
  await expect(page.getByText(/لا توجد قسيمة راتب|No payslip exists/i)).toHaveCount(0);
});
