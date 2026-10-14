import type {Page} from '@playwright/test';
const groups:Record<string,string>={employees:'people',attendance:'people',annual_leave:'people',payroll_runs:'payroll',loans_penalties:'payroll',gosi:'payroll',journals:'payroll',salary_accounts:'payroll',reports:'payroll',company_profile:'company',settings:'company',users:'access',audit_logs:'access'};
export async function navigate(page:Page,id:string){
 const group=groups[id];if(group){const arrow=page.getByTestId(`nav-group-${group}`);if(await arrow.getAttribute('aria-expanded')!=='true')await arrow.click();}
 await page.getByTestId(`nav-${id}`).click();
}
