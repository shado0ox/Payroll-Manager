import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createGosiRouter} from './routes/gosi-routes.mjs';

const server=fs.readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
const routes=fs.readFileSync(new URL('./routes/gosi-routes.mjs',import.meta.url),'utf8');
const parser=fs.readFileSync(new URL('../src/utils/gosiInvoiceImport.ts',import.meta.url),'utf8');
const view=fs.readFileSync(new URL('../src/components/GosiReconciliationView.tsx',import.meta.url),'utf8');
const companyGosi=fs.readFileSync(new URL('../src/components/company/CompanyGosiAccountsTab.tsx',import.meta.url),'utf8');
const companyProfile=fs.readFileSync(new URL('../src/components/CompanyProfileView.tsx',import.meta.url),'utf8');

test('GOSI storage supports multiple company registrations and effective-dated employee assignments',()=>{
  assert.match(server,/CREATE TABLE IF NOT EXISTS \$\{q\('gosi_accounts'\)\}/);
  assert.match(server,/UNIQUE\(company_id,registration_number\)/);
  assert.match(server,/gosi_employee_assignments/);
  assert.match(routes,/daterange\(effective_from/);
  assert.match(routes,/effective_to=\$2::date-1/);
  assert.match(server,/gosi_department_assignments/);
  assert.match(routes,/GOSI_DEPARTMENT_ASSIGNMENT_OVERLAP/);
});

test('GOSI accounts live in company profile and departments provide the default assignment',()=>{
  assert.match(companyProfile,/CompanyGosiAccountsTab/);
  assert.match(companyGosi,/ربط الأقسام بفروع التأمينات/);
  assert.match(companyGosi,/saveGosiDepartmentAssignment/);
  assert.match(companyGosi,/deleteGosiDepartmentAssignment/);
  assert.match(companyGosi,/حفظ التعديل/);
  assert.match(routes,/END_GOSI_DEPARTMENT_ASSIGNMENT/);
  assert.match(routes,/effective_to=\$2::date-1/);
  assert.match(view,/استخدام ربط القسم/);
  assert.doesNotMatch(view,/حسابات التأمينات<\/h3>/);
});

test('GOSI invoice import is tenant scoped, bounded, atomic, and audited',()=>{
  assert.match(routes,/MANAGE_GOSI/);
  assert.match(routes,/body\.rows\.length>2500/);
  assert.match(routes,/await client\.query\('BEGIN'\)/);
  assert.match(routes,/IMPORT_GOSI_INVOICE/);
  assert.match(routes,/GOSI_INVOICE_ALREADY_EXISTS/);
  assert.match(routes,/GOSI_ACCOUNT_IN_USE/);
  assert.match(routes,/gosi_employee_assignments/);
  assert.match(routes,/gosi_department_assignments/);
  assert.match(view,/توجد فاتورة محفوظة لهذا الحساب والشهر/);
  assert.match(view,/الخاضعون للتأمينات/);
  assert.match(view,/تابعون للحساب المختار/);
  assert.match(view,/غير مربوطين/);
  assert.match(view,/activeDepartmentAssignments/);
  assert.match(routes,/DELETE FROM \$\{q\('gosi_invoices'\)\} WHERE id=\$1 AND company_id=\$2/);
  assert.match(routes,/DELETE_GOSI_INVOICE/);
  assert.match(view,/deleteGosiInvoice/);
  assert.match(routes,/await client\.query\('COMMIT'\)/);
  assert.match(routes,/req\.user\.company_ids\.includes\(companyId\)/);
});

test('GOSI comparison uses identity, selected payroll period, account assignment, and stored payroll item values',()=>{
  assert.match(routes,/nationalIdOrIqama,p\.iqamaNumber,p\.entryNumber/);
  assert.match(routes,/period_month=\$2/);
  assert.match(routes,/gosiSubjectAmount/);
  assert.match(routes,/gosiEmployerShare/);
  assert.match(routes,/gosiEmployeeShare/);
  assert.match(routes,/assignmentByDepartment/);
  assert.match(routes,/employeeOverride\?'EMPLOYEE':'DEPARTMENT'/);
  assert.match(routes,/accountName:invoice\.account_name/);
  assert.match(routes,/department:employee/);
  assert.match(view,/الاختلافات فقط/);
  assert.match(view,/حصة الموظف بالفاتورة/);
  assert.match(view,/مصدر الربط/);
  for(const status of ['INVOICE_ONLY','PAYROLL_ONLY','UNASSIGNED_ACCOUNT','WRONG_ACCOUNT','MISSING_IN_PAYROLL','DIFFERENT']) assert.match(routes,new RegExp(status));
});

test('GOSI parser recognizes the detailed Arabic invoice layout and protects upload limits',()=>{
  assert.match(parser,/readXlsxFile/);
  assert.match(parser,/8\*1024\*1024/);
  assert.match(parser,/row\[23\]/);
  assert.match(parser,/row\[25\]/);
  assert.match(parser,/DUPLICATE_GOSI_IDENTITIES/);
  assert.match(view,/detectedMonth!==invoiceMonth/);
  assert.match(view,/accept="\.xlsx"/);
});

test('GOSI router factory registers without monolith globals',()=>{
  const middleware=(_req,_res,next)=>next();
  const router=createGosiRouter({auth:middleware,writeLimiter:middleware});
  assert.equal(typeof router,'function');
});
