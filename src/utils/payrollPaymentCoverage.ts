import { salaryBatchAllocations } from '../../server/payroll-ledger.mjs';
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

export const getPayrollPaymentCoverages = (runs: PayrollRun[]): PayrollPaymentCoverage[] => runs.flatMap(run =>
  (run.paymentBatches || []).filter(batch => ['SCHEDULED', 'PAID'].includes(batch.status)).flatMap(batch =>
    salaryBatchAllocations(run, batch).map(allocation => ({
      batch, paymentPayrollRunId:run.id, paymentPeriodMonth:run.periodMonth,
      sourcePeriodMonth:allocation.periodMonth, employeeId:allocation.employeeId,
      amount:allocation.amount, isPriorPeriod:allocation.periodMonth !== run.periodMonth,
    }))
  )
);
