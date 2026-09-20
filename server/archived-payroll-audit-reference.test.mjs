import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildPayrollRepairPlan } from './payroll-data-repair.mjs';

const routes=fs.readFileSync(new URL('./routes/admin-database-routes.mjs',import.meta.url),'utf8');

test('payroll audit loads archived employees as historical references',()=>{
  assert.match(routes,/withArchivedEmployeeReferences/);
  assert.match(routes,/WHERE is_archived=true AND company_id=ANY/);
  assert.match(routes,/isArchived:true/);
});

test('an archived employee reference is not reported missing from a closed payroll',()=>{
  const employee={id:'archived-1',employeeNo:'E-1',firstNameAr:'موظفة',lastNameAr:'مؤرشفة',isArchived:true};
  const item={employeeId:'archived-1',employeeNo:'E-1',employeeName:'موظفة مؤرشفة'};
  const run={id:'run-1',companyId:'company-1',periodMonth:'2026-08',status:'APPROVED',items:[item],paymentBatches:[]};
  const plan=buildPayrollRepairPlan({employees:[employee],payrollRuns:[run],journals:[]},['company-1']);
  assert.equal(plan.issues[0]?.details?.missingEmployees?.length || 0,0);
});
