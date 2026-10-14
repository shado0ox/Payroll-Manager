import {test,expect} from '@playwright/test';
test('related sidebar tabs stay together and can collapse without losing navigation or mobile access',async({page})=>{
 await page.goto('/login');const form=page.locator('form').first();await form.locator('input[autocomplete="organization"]').fill('101');await form.locator('input[autocomplete="username"]').fill('admin');await form.locator('input[autocomplete="current-password"]').fill('TestAdmin1!');
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/state')&&r.ok()),form.locator('button[type="submit"]').click()]);
 const group=page.getByTestId('nav-group-company');await expect(group).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('#nav-group-content-company').getByTestId('nav-company_profile')).toBeVisible();await expect(page.locator('#nav-group-content-company').getByTestId('nav-settings')).toBeVisible();
 await group.click();await expect(group).toHaveAttribute('aria-expanded','false');await expect(page.getByTestId('nav-settings')).toBeHidden();
 await group.click();await page.getByTestId('nav-settings').click();await expect(page.getByTestId('nav-settings')).toHaveAttribute('aria-current','page');
 await page.getByTestId('nav-group-payroll').click();await expect(page.getByTestId('nav-payroll_runs')).toBeHidden();
 await page.setViewportSize({width:390,height:844});await expect(page.getByTestId('nav-payroll_runs')).toBeVisible();await expect(group).toBeHidden();
});
