import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('full-page surfaces own a viewport-sized scroll container', () => {
  const css = read('src/index.css');
  const login = read('src/components/LoginView.tsx');
  const suspended = read('src/components/SubscriptionSuspendedView.tsx');
  const attendanceReport = read('src/components/PublicAttendanceReport.tsx');

  assert.match(css, /\.wafr-page-scroll,\s*\n\.wafr-public-site\s*\{/);
  assert.match(css, /\.wafr-page-scroll,[\s\S]*?height:\s*100dvh;[\s\S]*?overflow-y:\s*auto;/);
  assert.match(css, /\.wafr-login\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?min-height:\s*0;/);
  assert.match(login, /wafr-login/);
  assert.match(suspended, /wafr-page-scroll/);
  assert.ok((attendanceReport.match(/wafr-page-scroll/g) ?? []).length >= 2);
});

test('application dialogs remain scrollable on short screens', () => {
  const css = read('src/index.css');
  const paymentModal = read('src/components/payroll/PayrollPaymentBatchModal.tsx');

  assert.match(css, /\.wafr-app-shell\s+:where\(\.fixed\.inset-0\)\s*\{[\s\S]*?overflow-y:\s*auto;/);
  assert.match(paymentModal, /fixed inset-0[^"']*overflow-y-auto/);
  assert.match(paymentModal, /max-h-\[calc\(100dvh-/);
  assert.match(paymentModal, /overflow-y-auto/);
});
