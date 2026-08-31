import fs from 'node:fs';

const serverUrl = new URL('../server/index.mjs', import.meta.url);
let source = fs.readFileSync(serverUrl, 'utf8');

const importLine = `import { validatePayrollCarryForwardState } from './payroll-carryforward-validation.mjs';`;
if (!source.includes(importLine)) {
  const importAnchor = `import express from 'express';`;
  if (!source.includes(importAnchor)) throw new Error('Server import anchor not found');
  source = source.replace(importAnchor, `${importAnchor}\n${importLine}`);
}

const callLine = `  validatePayrollCarryForwardState(stored?.payrollRuns, incoming?.payrollRuns);`;
if (!source.includes(callLine)) {
  const callAnchor = `  validatePayrollWorkflowChanges(stored?.payrollRuns, incoming?.payrollRuns, user);`;
  if (!source.includes(callAnchor)) throw new Error('Payroll workflow validation call anchor not found');
  source = source.replace(callAnchor, `${callAnchor}\n${callLine}`);
}

fs.writeFileSync(serverUrl, source);
console.log('Server carry-forward payroll validation applied.');
