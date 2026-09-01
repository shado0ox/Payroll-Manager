import fs from 'node:fs';

const payrollUrl = new URL('../src/components/PayrollRunsView.tsx', import.meta.url);
let source = fs.readFileSync(payrollUrl, 'utf8');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing current payroll month anchor: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
  `import React, { useState, useMemo } from 'react';`,
  `import React, { useState, useMemo, useEffect } from 'react';`,
  'React useEffect import',
);

replaceOnce(
  `  const currentPeriod = new Date().toISOString().slice(0, 7);`,
  `  const currentDate = new Date();
  const currentPeriod = \`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}\`;`,
  'local current period',
);

replaceOnce(
  `  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    companyRuns[0]?.periodMonth || currentPeriod
  );`,
  `  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentPeriod);

  // Open payroll on the operating month, not the first historical run.
  // Reset to the operating month when switching companies; historical periods
  // remain available in the period selector.
  useEffect(() => {
    setSelectedPeriod(currentPeriod);
  }, [company.id, currentPeriod]);`,
  'current month initial selection',
);

fs.writeFileSync(payrollUrl, source);
console.log('Payroll screen now opens on the current operating month.');
