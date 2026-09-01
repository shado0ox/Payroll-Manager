import fs from 'node:fs';

const file = 'src/App.tsx';
let source = fs.readFileSync(file, 'utf8');

if (!source.includes("  settlements: '/settlements',")) {
  const before = "  payroll_runs: '/payroll',\n  attendance: '/attendance',";
  const after = "  payroll_runs: '/payroll',\n  settlements: '/settlements',\n  attendance: '/attendance',";
  if (!source.includes(before)) throw new Error('Missing PR21 stable route anchor');
  source = source.replace(before, after);
}

fs.writeFileSync(file, source);
console.log('PR21 settlements stable route compatibility applied.');
