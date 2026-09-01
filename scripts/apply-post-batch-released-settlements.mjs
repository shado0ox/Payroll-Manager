import fs from 'node:fs';

const path = 'src/components/PayrollSettlementsView.tsx';
let source = fs.readFileSync(path, 'utf8');

const before = `        const isHeld = (item.entitlementStatus || 'PAYABLE') === 'HELD';\n        if (!isHeld || paidPayrollKeys.has(\`${'${run.id}:${item.employeeId}'}\`)) continue;\n        const key = \`HELD:${'${run.id}'}:${'${item.id}'}\`;`;
const after = `        const entitlementStatus = item.entitlementStatus || 'PAYABLE';\n        const isHeld = entitlementStatus === 'HELD';\n        const runHasClosedPaymentBatch = (run.paymentBatches || []).some(batch => ['SCHEDULED', 'PAID'].includes(batch.status));\n        const isReleasedAfterBatch = entitlementStatus === 'PAYABLE' && runHasClosedPaymentBatch;\n        if ((!isHeld && !isReleasedAfterBatch) || paidPayrollKeys.has(\`${'${run.id}:${item.employeeId}'}\`)) continue;\n        const key = \`HELD:${'${run.id}'}:${'${item.id}'}\`;`;

if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Missing post-batch released settlement anchor');
  source = source.replace(before, after);
}

fs.writeFileSync(path, source);
console.log('Post-batch released held salaries are routed to settlements.');
