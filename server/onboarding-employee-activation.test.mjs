import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const view = fs.readFileSync('src/components/EmployeesView.tsx', 'utf8');

test('onboarding employees have a dedicated completion and activation action', () => {
  assert.match(view, /emp\.status === 'ONBOARDING'/);
  assert.match(view, /data-onboarding-activation/);
  assert.match(view, /handleCompleteOnboarding/);
  assert.match(view, /processedForm\.status = 'ACTIVE'/);
});

test('activation requires a ten-digit Iqama and valid Saudi IBAN', () => {
  assert.match(view, /\/\^\\d\{10\}\$\//);
  assert.match(view, /validateSaudiIBAN\(iban\)/);
  assert.match(view, /processedForm\.nationalIdOrIqama = iqama/);
  assert.match(view, /processedForm\.bankIban = iban/);
});

test('onboarding remains visible as an explicit employment status', () => {
  assert.match(view, /<option value="ONBOARDING">/);
});


test('non-Saudi edit mode is synchronized before the modal renders', () => {
  assert.match(view, /setNonSaudiEntryMode\(emp\.iqamaNumber \|\| emp\.iqamaExpiryDate/);
  assert.match(view, /setNonSaudiEntryMode\('IQAMA_HOLDER'\)/);
  assert.match(view, /empCopy\.iqamaIssueStatus = 'ISSUED'/);
});
