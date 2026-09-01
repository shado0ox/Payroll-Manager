import fs from 'node:fs';

const patch = (path, transform) => {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next);
};

patch('src/types/index.ts', source => {
  if (!source.includes('priorPeriodNet?: number;')) {
    source = source.replace(
      `  adjustmentNotes?: string;\n`,
      `  adjustmentNotes?: string;\n  priorPeriodGross?: number;\n  priorPeriodDeductions?: number;\n  priorPeriodNet?: number;\n  priorPeriodDetails?: Array<{ periodMonth: string; gross: number; deductions: number; net: number }>;\n`
    );
  }
  return source;
});

patch('src/components/PayrollRunsView.tsx', source => {
  source = source.replace(
`  const handleRecalculate = () => {\n    if (currentRun?.paymentBatches?.some(batch => batch.status === 'PAID')) {\n      alert(tr('لا يمكن إعادة احتساب المسير بعد تسجيل دفعة محولة. ألغِ حالة التحويل أو أنشئ تسوية مستقلة.', 'Payroll cannot be recalculated after a paid batch. Reverse the payment or create a separate settlement.'));\n      return;\n    }\n    setIsCalculating(true);`,
`  const handleRecalculate = () => {\n    setIsCalculating(true);`
  );

  source = source.replace(
`    if (currentRun.paymentBatches?.some(batch => ['SCHEDULED', 'PAID'].includes(batch.status))) {\n      alert(tr('لا يمكن تعديل مبالغ المسير بعد إنشاء دفعة تحويل نشطة. ألغِ الدفعة أولًا.', 'Payroll amounts cannot be edited while an active transfer batch exists. Cancel the batch first.'));\n      return;\n    }`,
`    const employeeBatch = getEmployeePaymentBatch(adjustmentItem.employeeId);\n    if (employeeBatch && ['SCHEDULED', 'PAID'].includes(employeeBatch.status)) {\n      alert(tr('لا يمكن تعديل موظف تم إدراجه في أمر تحويل نشط أو تم تحويل راتبه بالفعل.', 'A payroll item cannot be edited after the employee is included in an active or paid transfer batch.'));\n      return;\n    }`
  );

  source = source.replace(
    `        const empLoans = loans.filter(l => l.employeeId === emp.id);`,
    `        const empLoans = loans.filter(l => l.employeeId === emp.id && String(l.startDate || '').slice(0, 7) <= selectedPeriod);`
  );

  const calcAnchor = `        const calculated = calculateEmployeePayrollItem({\n          employee: emp,\n          company,\n          periodMonth: selectedPeriod,\n          attendanceRecords: empAtt,\n          activeLoans: empLoans,\n          penalties: empPens,\n          temporaryEarnings: empEarnings,\n        });`;
  const calcReplacement = `        let calculated = calculateEmployeePayrollItem({\n          employee: emp,\n          company,\n          periodMonth: selectedPeriod,\n          attendanceRecords: empAtt,\n          activeLoans: empLoans,\n          penalties: empPens,\n          temporaryEarnings: empEarnings,\n        });\n\n        // Carry every unpaid prior salary period into the current run exactly once.\n        // Unpaid prior periods are recalculated from their own period inputs, so a July deduction\n        // added later for an unpaid employee immediately changes the July carried balance.\n        const priorPeriodDetails: Array<{ periodMonth: string; gross: number; deductions: number; net: number }> = [];\n        const salaryStartDate = String(emp.salaryStartDate || emp.hireDate || '');\n        const salaryStartMonth = /^\\d{4}-\\d{2}-\\d{2}$/.test(salaryStartDate) ? salaryStartDate.slice(0, 7) : selectedPeriod;\n        let cursor = salaryStartMonth;\n        while (cursor < selectedPeriod && priorPeriodDetails.length < 240) {\n          const historicalRun = companyRuns.find(run => run.periodMonth === cursor);\n          const alreadyTransferred = Boolean(historicalRun?.paymentBatches?.some(batch =>\n            ['SCHEDULED', 'PAID'].includes(batch.status) && (batch.employeeIds || []).includes(emp.id)\n          ));\n          if (!alreadyTransferred) {\n            const [priorYear, priorMonthNo] = cursor.split('-').map(Number);\n            const priorEnd = \`${'${cursor}'}-${'${String(new Date(Date.UTC(priorYear, priorMonthNo, 0)).getUTCDate()).padStart(2, \'0\')}'}\`;\n            const priorStart = \`${'${cursor}'}-01\`;\n            const priorEmployee = cursor === salaryStartMonth ? { ...emp, prorateFirstMonth: true } : emp;\n            const priorItem = calculateEmployeePayrollItem({\n              employee: priorEmployee,\n              company,\n              periodMonth: cursor,\n              attendanceRecords: attendance.filter(a => a.employeeId === emp.id && a.date <= priorEnd && (a.endDate || a.date) >= priorStart),\n              activeLoans: loans.filter(l => l.employeeId === emp.id && String(l.startDate || '').slice(0, 7) <= cursor),\n              penalties: penalties.filter(p => p.employeeId === emp.id && p.periodMonth === cursor && p.appliedInPayroll !== false),\n              temporaryEarnings: temporaryEarnings.filter(e => e.employeeId === emp.id && e.periodMonth === cursor && e.appliedInPayroll !== false),\n            });\n            if (Number(priorItem?.netSalary || 0) > 0) {\n              priorPeriodDetails.push({\n                periodMonth: cursor,\n                gross: Number(priorItem?.totalGrossSalary || 0),\n                deductions: Number(priorItem?.totalDeductions || 0),\n                net: Number(priorItem?.netSalary || 0),\n              });\n            }\n          }\n          const [cursorYear, cursorMonth] = cursor.split('-').map(Number);\n          const next = new Date(Date.UTC(cursorYear, cursorMonth, 1));\n          cursor = \`${'${next.getUTCFullYear()}'}-${'${String(next.getUTCMonth() + 1).padStart(2, \'0\')}'}\`;\n        }\n        const priorPeriodGross = roundAmount(priorPeriodDetails.reduce((sum, row) => sum + row.gross, 0));\n        const priorPeriodDeductions = roundAmount(priorPeriodDetails.reduce((sum, row) => sum + row.deductions, 0));\n        const priorPeriodNet = roundAmount(priorPeriodDetails.reduce((sum, row) => sum + row.net, 0));\n        if (priorPeriodNet > 0) {\n          calculated = {\n            ...calculated,\n            priorPeriodGross,\n            priorPeriodDeductions,\n            priorPeriodNet,\n            priorPeriodDetails,\n            netSalary: roundAmount(calculated.netSalary + priorPeriodNet),\n            totalCompanyBurden: roundAmount(calculated.totalCompanyBurden + priorPeriodNet),\n            warningFlags: [...calculated.warningFlags, tr(\`رصيد فترات سابقة غير محول: ${'${formatSAR(priorPeriodNet)}'}\`, \`Unpaid prior-period balance: ${'${formatSAR(priorPeriodNet)}'}\`)],\n          };\n        }`;
  if (source.includes(calcAnchor)) source = source.replace(calcAnchor, calcReplacement);

  const previousAnchor = `        const previousItem = previousItemsByEmployeeId.get(emp.id)\n          || (employeeNo && !duplicateEmployeeNumbers.has(employeeNo)\n            ? previousItemsByEmployeeNo.get(employeeNo)\n            : undefined);`;
  const previousReplacement = `${previousAnchor}\n        // Employees already included in an active/paid transfer batch are immutable.\n        if (previousItem && committedEmployeeIds.has(emp.id)) return previousItem;`;
  if (!source.includes('if (previousItem && committedEmployeeIds.has(emp.id)) return previousItem;')) {
    source = source.replace(previousAnchor, previousReplacement);
  }

  source = source.replace(
    `      const totalGrossSalaries = roundAmount(runItems.reduce((s, i) => s + i.totalGrossSalary, 0), decimals);`,
    `      const totalGrossSalaries = roundAmount(runItems.reduce((s, i) => s + i.totalGrossSalary + Number(i.priorPeriodGross || 0), 0), decimals);`
  );
  source = source.replace(
    `      const totalDeductions = roundAmount(runItems.reduce((s, i) => s + i.totalDeductions, 0), decimals);`,
    `      const totalDeductions = roundAmount(runItems.reduce((s, i) => s + i.totalDeductions + Number(i.priorPeriodDeductions || 0), 0), decimals);`
  );

  source = source.replace(
    `{tr('إجمالي الإضافات', 'Total additions'), currentRun.totalGrossSalaries - currentRun.totalBaseSalaries, 'text-emerald-700'],`,
    `{tr('إجمالي الإضافات', 'Total additions'), currentRun.totalGrossSalaries - currentRun.totalBaseSalaries, 'text-emerald-700'],`
  );

  source = source.replace(
    `              [tr('صافي الرواتب', 'Net salaries'), currentRun.totalNetSalaries, 'text-emerald-800'],`,
    `              [tr('أرصدة سابقة', 'Prior balances'), (currentRun.items || []).reduce((sum, item) => sum + Number(item.priorPeriodNet || 0), 0), 'text-blue-700'],\n              [tr('صافي الرواتب', 'Net salaries'), currentRun.totalNetSalaries, 'text-emerald-800'],`
  );

  return source;
});

patch('src/components/Sidebar.tsx', source => {
  source = source.replace(/\n\s*\{ id: 'settlements',[^\n]*\},/g, '');
  source = source.replace(/\n\s*\{\n\s*id: 'settlements',[\s\S]*?\n\s*\},/g, '');
  return source;
});

patch('server/index.mjs', source => {
  const immutable = `    // Once approved, salary calculations and employee items are immutable. Workflow metadata and\n    // payment batches remain separate so a legitimate SCHEDULED/PAID batch can still be recorded.\n    if (['APPROVED','POSTED'].includes(oldStatus) && !sameJson(payrollFinancialCore(oldRun), payrollFinancialCore(nextRun))) {\n      throw workflowError(409, 'APPROVED_PAYROLL_IMMUTABLE');\n    }`;
  const selective = `    // Approved/posting no longer freezes the whole month. Only employees already reserved/paid\n    // in an active transfer batch are immutable; unpaid/new employees may be recalculated or added.\n    if (['APPROVED','POSTED'].includes(oldStatus)) {\n      if (oldRun.companyId !== nextRun.companyId || oldRun.periodMonth !== nextRun.periodMonth) {\n        throw workflowError(409, 'APPROVED_PAYROLL_IDENTITY_IMMUTABLE');\n      }\n      const lockedEmployeeIds = new Set(\n        asArray(oldRun.paymentBatches)\n          .filter(batch => ['SCHEDULED','PAID'].includes(batch.status))\n          .flatMap(batch => asArray(batch.employeeIds))\n      );\n      const oldItemsByEmployee = new Map(asArray(oldRun.items).map(item => [item.employeeId, item]));\n      const nextItemsByEmployee = new Map(asArray(nextRun.items).map(item => [item.employeeId, item]));\n      for (const employeeId of lockedEmployeeIds) {\n        if (!sameJson(oldItemsByEmployee.get(employeeId), nextItemsByEmployee.get(employeeId))) {\n          throw workflowError(409, 'TRANSFERRED_EMPLOYEE_PAYROLL_IMMUTABLE');\n        }\n      }\n    }`;
  if (source.includes(immutable)) source = source.replace(immutable, selective);

  const sourceLockOld = `const payrollSourceLocked = (stored, kind, record) => closedRunsForInput(stored, record.companyId).some(run => {\n  const item = asArray(run.items).find(candidate => candidate.employeeId === record.employeeId);\n  if (!item) return false;\n  if (kind === 'attendance') return run.periodMonth === record.periodMonth;\n  if (kind === 'penalty') return run.periodMonth === record.periodMonth && Number(item.penaltiesDeduction || 0) !== 0;\n  if (kind === 'earning') return run.periodMonth === record.periodMonth && Number(item.bonuses || 0) !== 0;\n  return run.periodMonth >= record.startDate && Number(item.loanDeduction || 0) !== 0;\n});`;
  const sourceLockNew = `const payrollSourceLocked = (stored, kind, record) => closedRunsForInput(stored, record.companyId).some(run => {\n  const item = asArray(run.items).find(candidate => candidate.employeeId === record.employeeId);\n  if (!item) return false;\n  // Payroll inputs remain editable for unpaid/held employees. Once the employee is reserved\n  // in a SCHEDULED batch or actually PAID, source entries used by that payroll item are locked.\n  const employeePaymentLocked = asArray(run.paymentBatches).some(batch =>\n    ['SCHEDULED','PAID'].includes(batch.status) && asArray(batch.employeeIds).includes(record.employeeId)\n  );\n  if (!employeePaymentLocked) return false;\n  if (kind === 'attendance') return run.periodMonth === record.periodMonth;\n  if (kind === 'penalty') return run.periodMonth === record.periodMonth && Number(item.penaltiesDeduction || 0) !== 0;\n  if (kind === 'earning') return run.periodMonth === record.periodMonth && Number(item.bonuses || 0) !== 0;\n  return run.periodMonth >= record.startDate && Number(item.loanDeduction || 0) !== 0;\n});`;
  if (source.includes(sourceLockOld)) source = source.replace(sourceLockOld, sourceLockNew);
  return source;
});

console.log('Unified payroll ledger recalculation applied.');
