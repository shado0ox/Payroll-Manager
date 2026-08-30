import fs from 'node:fs';

const appUrl = new URL('../src/App.tsx', import.meta.url);
const payrollUrl = new URL('../src/components/PayrollRunsView.tsx', import.meta.url);

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing transform anchor: ${label}`);
  return source.replace(before, after);
}

// Route all PayrollRunsView saves through an explicit server-confirmed write.
// The UI state is not changed until /api/state/patch succeeds, so refresh cannot
// display an approval/payment that was never persisted.
{
  let source = fs.readFileSync(appUrl, 'utf8');
  const anchor = `  const handleSavePayrollRun = (run: PayrollRun) => {`;
  const confirmedHandler = `  const handleSavePayrollRunConfirmed = async (run: PayrollRun): Promise<boolean> => {\n    const previousRun = state.payrollRuns.find(r => r.id === run.id);\n    const updated = previousRun\n      ? state.payrollRuns.map(r => r.id === run.id ? run : r)\n      : [run, ...state.payrollRuns];\n    const nextState = { ...state, payrollRuns: updated } as MasarAppState;\n\n    try {\n      // Finish any older autosave first so it cannot overwrite this financial action.\n      await persistenceQueueRef.current.catch(() => undefined);\n      setDbStatus(prev => ({ ...prev, isChecking: true }));\n      await api.saveState(nextState);\n\n      // Mark this exact object as already persisted so the generic autosave effect\n      // does not issue a duplicate write after setState.\n      remoteStateSnapshotRef.current = nextState;\n      savePayrollRuns(updated);\n      setState(nextState);\n      setDbStatus(prev => ({\n        ...prev,\n        isCloudConnected: true,\n        isChecking: false,\n        lastSavedAt: new Date().toISOString(),\n        lastError: null,\n      }));\n      return true;\n    } catch (error: any) {\n      setDbStatus(prev => ({\n        ...prev,\n        isChecking: false,\n        lastError: error?.message || tr('تعذر حفظ عملية الرواتب', 'Could not save the payroll action'),\n      }));\n      alert(tr('لم يتم اعتماد التعديل لأن الخادم لم يؤكد الحفظ. حاول مرة أخرى.', 'The change was not applied because the server did not confirm the save. Please try again.'));\n      return false;\n    }\n  };\n\n`;
  source = replaceOnce(source, anchor, confirmedHandler + anchor, 'confirmed payroll handler');
  source = replaceOnce(
    source,
    `                onSavePayrollRun={handleSavePayrollRun}`,
    `                onSavePayrollRun={handleSavePayrollRunConfirmed}`,
    'PayrollRunsView confirmed handler wiring'
  );
  fs.writeFileSync(appUrl, source);
}

// Make the callback contract explicit for the payroll screen. Existing callers may
// ignore the Promise, but the parent only updates visible state after server success.
{
  let source = fs.readFileSync(payrollUrl, 'utf8');
  source = replaceOnce(
    source,
    `  onSavePayrollRun: (run: PayrollRun) => void;`,
    `  onSavePayrollRun: (run: PayrollRun) => Promise<boolean>;`,
    'payroll callback contract'
  );
  fs.writeFileSync(payrollUrl, source);
}

console.log('Server-confirmed payroll persistence transform applied.');
