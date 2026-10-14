import {expect,test} from '@playwright/test';
test('loan form previews six whole-riyal installments with remainder in the last month',async({page})=>{
 await page.goto('/login');
 const login=page.locator('form').first();
 await login.locator('input[autocomplete="organization"]').fill('101');
 await login.locator('input[autocomplete="username"]').fill('admin');
 await login.locator('input[autocomplete="current-password"]').fill('TestAdmin1!');
 await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/state')&&response.ok()),login.locator('button[type="submit"]').click()]);
 await page.getByTestId('nav-loans_penalties').click();
 await page.getByRole('button',{name:/إضافة سلفة جديدة|Add loan/i}).click();
 await page.getByLabel(/إجمالي مبلغ السلفة|Total loan amount/i).fill('1000');
 await page.getByLabel(/عدد أشهر السداد|Repayment months/i).fill('6');
 await page.getByLabel(/شهر أول قسط|First installment month/i).fill('2026-11');
 const rows=page.getByTestId('loan-schedule-preview').locator('tbody tr');
 await expect(rows).toHaveCount(6);
 expect(await rows.locator('td:nth-child(2)').allTextContents()).toEqual(['166','166','166','166','166','170']);
 await expect(rows.last().locator('td').first()).toHaveText('2027-04');
 await expect(page.getByTestId('loan-schedule-preview').locator('tfoot')).toContainText('1000');
});
