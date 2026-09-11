import type { PayrollPaymentBatch, PayrollRun } from '../types';

export interface PayrollPaymentCoverage {
  batch: PayrollPaymentBatch;
  paymentPayrollRunId: string;
  paymentPeriodMonth: string;
  sourcePeriodMonth: string;
  employeeId: string;
  amount: number;
  isPriorPeriod: boolean;
}

const activeStatuses = new Set(['SCHEDULED', 'PAID']);
const roundAmount = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

/**
 * Expands each active transfer batch into the salary months it settles.
 * Historical batches need no migration: priorPeriodDetails already stores the allocation.
 */
export const getPayrollPaymentCoverages = (runs: PayrollRun[]): PayrollPaymentCoverage[] => {
  const coverages: PayrollPaymentCoverage[] = [];

  runs.forEach(paymentRun => {
    const itemsByEmployee = new Map(paymentRun.items.map(item => [item.employeeId, item]));
    (paymentRun.paymentBatches || []).forEach(batch => {
      if (!activeStatuses.has(batch.status)) return;
      const batchCoverages = new Map<string, PayrollPaymentCoverage>();
      const addCoverage = (coverage: PayrollPaymentCoverage) => {
        const key = `${coverage.sourcePeriodMonth}:${coverage.employeeId}`;
        if (!batchCoverages.has(key)) batchCoverages.set(key, coverage);
      };

      batch.employeeIds.forEach(employeeId => {
        const item = itemsByEmployee.get(employeeId);
        if (!item) return;
        const priorNet = roundAmount((item.priorPeriodDetails || []).reduce((sum, detail) => sum + Number(detail.net || 0), 0));
        const currentPeriodAmount = roundAmount(Number(item.netSalary || 0) - priorNet);
        if (currentPeriodAmount > 0) addCoverage({
          batch,
          paymentPayrollRunId: paymentRun.id,
          paymentPeriodMonth: paymentRun.periodMonth,
          sourcePeriodMonth: paymentRun.periodMonth,
          employeeId,
          amount: currentPeriodAmount,
          isPriorPeriod: false,
        });
        (item.priorPeriodDetails || []).forEach(detail => {
          if (!detail.periodMonth) return;
          addCoverage({
            batch,
            paymentPayrollRunId: paymentRun.id,
            paymentPeriodMonth: paymentRun.periodMonth,
            sourcePeriodMonth: detail.periodMonth,
            employeeId,
            amount: roundAmount(detail.net),
            isPriorPeriod: detail.periodMonth !== paymentRun.periodMonth,
          });
        });
      });

      (batch.priorEntitlements || []).forEach(ref => {
        if (!ref.sourcePeriodMonth || !ref.employeeId) return;
        addCoverage({
          batch,
          paymentPayrollRunId: paymentRun.id,
          paymentPeriodMonth: paymentRun.periodMonth,
          sourcePeriodMonth: ref.sourcePeriodMonth,
          employeeId: ref.employeeId,
          amount: roundAmount(ref.amount),
          isPriorPeriod: ref.sourcePeriodMonth !== paymentRun.periodMonth,
        });
      });
      coverages.push(...batchCoverages.values());
    });
  });

  return coverages;
};
