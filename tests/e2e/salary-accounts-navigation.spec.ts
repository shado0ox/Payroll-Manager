import {navigate} from '../support/navigation';
import {test,expect} from '@playwright/test';
test('salary account is a separate automatic report; future journal periods and center account mapping persist',async({page})=>{
 await page.goto('/login');const form=page.locator('form').first();await form.locator('input[autocomplete="organization"]').fill('101');await form.locator('input[autocomplete="username"]').fill('admin');await form.locator('input[autocomplete="current-password"]').fill('TestAdmin1!');
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/state')&&r.ok()),form.locator('button[type="submit"]').click()]);
 await navigate(page,'salary_accounts');await expect(page.getByRole('heading',{name:/كشف حساب الرواتب المستحقة|Salary payable|Monthly salary account/})).toBeVisible();await expect(page.getByLabel(/شهر كشف الحساب|Statement month/).and(page.locator("input"))).toBeVisible();
 await navigate(page,'journals');const nextYear=`${new Date().getUTCFullYear()+1}-12`;await page.getByLabel(/فترة القيد|Journal period/).and(page.locator("input")).fill(nextYear);await expect(page.getByText(/لا يوجد قيد من هذا النوع|No journal of this type/)).toBeVisible();
 await navigate(page,'company_profile');await page.getByRole('button',{name:/^مراكز التكلفة|^Cost centers/}).click();await page.getByRole('button',{name:/إضافة مركز تكلفة جديد|Add cost center/}).click();
 const name=`مركز اختبار ${Date.now()}`;await page.getByLabel(/اسم مركز التكلفة بالعربية|Cost center name in Arabic/).fill(name);await page.getByLabel(/رقم حساب مصروف رواتب مركز التكلفة|Cost center salary expense account/).fill('510123');
 const write=page.waitForResponse(r=>r.request().method()==='PUT'&&/\/api\/companies\//.test(r.url()));await page.getByRole('button',{name:/^إضافة المركز$|^Add cost center$/}).click();const response=await write;expect(response.ok(),await response.text()).toBe(true);
 const stored=await page.evaluate(async(name)=>{const state=(await(await fetch('/api/state')).json()).state;return state.companies.flatMap((company:any)=>company.costCenters).find((cc:any)=>cc.nameAr===name);},name);expect(stored.salariesExpenseAccount).toBe('510123');
});
