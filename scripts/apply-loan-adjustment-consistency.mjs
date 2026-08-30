import fs from 'node:fs';

function patchFile(relativePath, transform) {
  const url = new URL(`../${relativePath}`, import.meta.url);
  const source = fs.readFileSync(url, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(url, next);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Missing loan adjustment consistency anchor: ${label}`);
  return source.replace(before, after);
}

patchFile('src/App.tsx', (initial) => {
  let source = initial;
  source = replaceOnce(
    source,
    `    if (!Number.isFinite(amount) || amount === 0 || !reason.trim() || !date) return;`,
    `    const adjustmentDate = new Date(\`\${date}T00:00:00Z\`);\n    if (!Number.isFinite(amount) || amount === 0 || !reason.trim() || !/^\\d{4}-\\d{2}-\\d{2}$/.test(date)\n      || Number.isNaN(adjustmentDate.getTime()) || adjustmentDate.toISOString().slice(0, 10) !== date) return;`,
    'frontend real date validation',
  );
  source = replaceOnce(
    source,
    `      const adjustment = {\n        id: \`loan-adj-\${Date.now()}\`, amount, date, reason: reason.trim(),\n        createdAt: new Date().toISOString(), createdBy: prev.currentUser?.id,\n      };\n      const updated = prev.loans.map(item => item.id === loanId ? {\n        ...item,\n        remainingAmount: nextBalance,\n        status: nextBalance === 0 ? 'COMPLETED' as const : item.status,\n        adjustments: [...(item.adjustments || []), adjustment],\n      } : item);`,
    `      const adjustment = {\n        id: \`loan-adj-\${Date.now()}\`, amount, date, reason: reason.trim(),\n        createdAt: new Date().toISOString(), createdBy: prev.currentUser?.id,\n      };\n      const installment = Number(existing.monthlyInstallment || 0);\n      const nextRemainingInstallments = nextBalance === 0\n        ? 0\n        : installment > 0 ? Math.ceil(nextBalance / installment) : existing.remainingInstallments;\n      const nextStatus = nextBalance === 0\n        ? 'COMPLETED' as const\n        : existing.status === 'COMPLETED' ? 'ACTIVE' as const : existing.status;\n      const updated = prev.loans.map(item => item.id === loanId ? {\n        ...item,\n        remainingAmount: nextBalance,\n        remainingInstallments: nextRemainingInstallments,\n        status: nextStatus,\n        adjustments: [...(item.adjustments || []), adjustment],\n      } : item);`,
    'frontend remaining schedule recalculation',
  );
  return source;
});

patchFile('server/index.mjs', (initial) => {
  let source = initial;
  source = replaceOnce(
    source,
    `  const immutableKeys = ['id','companyId','employeeId','totalAmount','monthlyInstallment','totalInstallments','remainingInstallments','startDate','reason'];`,
    `  const immutableKeys = ['id','companyId','employeeId','totalAmount','monthlyInstallment','totalInstallments','startDate','reason'];`,
    'allow derived remaining installment change',
  );
  source = replaceOnce(
    source,
    `  if (expectedBalance < 0 || Number(afterLoan.remainingAmount) !== expectedBalance) return false;\n  if (afterLoan.status !== beforeLoan.status && !(expectedBalance === 0 && afterLoan.status === 'COMPLETED')) return false;\n  adjustment.createdAt = new Date().toISOString();`,
    `  if (expectedBalance < 0 || Number(afterLoan.remainingAmount) !== expectedBalance) return false;\n  const parsedAdjustmentDate = new Date(\`\${adjustment.date}T00:00:00Z\`);\n  if (Number.isNaN(parsedAdjustmentDate.getTime()) || parsedAdjustmentDate.toISOString().slice(0, 10) !== adjustment.date) return false;\n  const installment = Number(beforeLoan.monthlyInstallment || 0);\n  const expectedRemainingInstallments = expectedBalance === 0\n    ? 0\n    : installment > 0 ? Math.ceil(expectedBalance / installment) : Number(beforeLoan.remainingInstallments || 0);\n  if (Number(afterLoan.remainingInstallments) !== expectedRemainingInstallments) return false;\n  const expectedStatus = expectedBalance === 0\n    ? 'COMPLETED'\n    : beforeLoan.status === 'COMPLETED' ? 'ACTIVE' : beforeLoan.status;\n  if (afterLoan.status !== expectedStatus) return false;\n  adjustment.createdAt = new Date().toISOString();`,
    'server validate derived schedule and status',
  );
  return source;
});

console.log('Loan adjustment consistency hardening applied.');
