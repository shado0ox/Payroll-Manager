import fs from 'node:fs';

const path = 'src/components/EmployeeStatementModal.tsx';
let source = fs.readFileSync(path, 'utf8');

const current = `import { Company, Employee, PayrollRun, LoanSchedule, AttendanceRecord } from '../types';`;
const compatible = `import { Company, Employee, PayrollRun, LoanSchedule } from '../types';`;

if (source.includes(current)) {
  source = source.replace(current, compatible);
  fs.writeFileSync(path, source);
}

console.log('PR21 employee statement import anchor compatibility prepared.');
