import assert from 'node:assert/strict';
import test from 'node:test';

import { createCompanyRecordService } from './company-record-service.mjs';

const workflowError = (status, code) => Object.assign(new Error(code), { status });
const service = createCompanyRecordService({
  q:name => name,
  asArray:value => Array.isArray(value) ? value : [],
  clone:structuredClone,
  subscriptionState:row => ({ status:row.subscription_status }),
  workflowError,
});

test('company record policy enforces assignment and unique child identifiers', () => {
  const record = { id:'company-a',companyCode:'A',nameAr:'شركة',departments:[],costCenters:[],bankDefinitions:[] };
  assert.doesNotThrow(() => service.validateCompanyRecord(record,{ company_ids:['company-a'] }));
  assert.throws(() => service.validateCompanyRecord(record,{ company_ids:['company-b'] }), error => error.status === 403);
  assert.throws(() => service.validateCompanyRecord({
    ...record,departments:[{ id:'department-1' },{ id:'department-1' }],
  },{ company_ids:['company-a'] }), error => error.message === 'DUPLICATE_COMPANY_STRUCTURE_ID');
});

test('company record policy validates IBAN bank codes and SWIFT identifiers', () => {
  const record = { id:'company-a',companyCode:'A',nameAr:'شركة',departments:[],costCenters:[],
    bankDefinitions:[{ ibanBankCode:'80',nameAr:'بنك',swiftCode:'RJHISARI' }] };
  assert.doesNotThrow(() => service.validateCompanyRecord(record,{ company_ids:['company-a'] }));
  assert.throws(() => service.validateCompanyRecord({
    ...record,bankDefinitions:[{ ibanBankCode:'8',nameAr:'بنك',swiftCode:'INVALID' }],
  },{ company_ids:['company-a'] }), error => error.message === 'INVALID_COMPANY_BANK_DEFINITION');
});
