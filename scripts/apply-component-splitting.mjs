import fs from 'node:fs';

const path = 'src/components/PayrollRunsView.tsx';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes("from './payroll/PayrollRunItemsTable'")) {
  const tableStart = source.indexOf('      {/* Itemized Payroll Run Table */}');
  const paymentModalStart = source.indexOf('\n\n      {isPaymentBatchModalOpen', tableStart);
  const adjustmentModalStart = source.indexOf('\n\n      {adjustmentItem && currentRun && (', paymentModalStart);
  if (tableStart < 0 || paymentModalStart < 0 || adjustmentModalStart < 0) {
    throw new Error('Payroll component split anchors not found');
  }

  const tableComponent = `      <PayrollRunItemsTable
        currentRun={currentRun}
        filteredItems={filteredItems}
        eligibleFilteredItems={eligibleFilteredItems}
        selectedPaymentEmployeeIds={selectedPaymentEmployeeIds}
        employees={employees}
        committedEmployeeIds={committedEmployeeIds}
        language={language}
        onToggleAllEligible={toggleAllEligibleEmployees}
        onTogglePaymentEmployee={togglePaymentEmployee}
        getEmployeePaymentBatch={getEmployeePaymentBatch}
        onEntitlementStatusChange={handleEntitlementStatusChange}
        onOpenAdjustment={openAdjustmentModal}
        onViewEmployeeStatement={onViewEmployeeStatement}
        tr={tr}
      />`;

  source = source.slice(0, tableStart) + tableComponent + source.slice(paymentModalStart);
  const nextPaymentStart = source.indexOf('      {isPaymentBatchModalOpen && currentRun && (');
  const nextAdjustmentStart = source.indexOf('\n\n      {adjustmentItem && currentRun && (', nextPaymentStart);
  const paymentComponent = `      {isPaymentBatchModalOpen && currentRun && (
        <PayrollPaymentBatchModal
          form={paymentBatchForm}
          selectedCount={selectedPaymentItems.length}
          total={selectedPaymentTotal}
          onChange={setPaymentBatchForm}
          onClose={() => setIsPaymentBatchModalOpen(false)}
          onSubmit={handleCreatePaymentBatch}
          tr={tr}
        />
      )}`;
  source = source.slice(0, nextPaymentStart) + paymentComponent + source.slice(nextAdjustmentStart);
  source = source.replace(
    "import { useLanguage } from '../i18n/LanguageContext';",
    "import { useLanguage } from '../i18n/LanguageContext';\nimport { PayrollRunItemsTable } from './payroll/PayrollRunItemsTable';\nimport { PayrollPaymentBatchModal } from './payroll/PayrollPaymentBatchModal';"
  );
  fs.writeFileSync(path, source);
}

for (const component of [
  'src/components/payroll/PayrollRunItemsTable.tsx',
  'src/components/payroll/PayrollPaymentBatchModal.tsx',
]) {
  const componentSource = fs.readFileSync(component, 'utf8');
  if (!componentSource.includes('React.memo')) throw new Error(`Memoized component missing: ${component}`);
}

console.log('Large payroll view components split into memoized children.');
