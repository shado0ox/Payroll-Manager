import { Employee } from '../types';

export type EmployeeLifecycleAlertType = 'IQAMA_EXPIRY' | 'SAUDI_CONTRACT_EXPIRY' | 'NEW_HIRE_ENTRY_DEADLINE' | 'MISSING_BANK_ACCOUNT';

export interface EmployeeLifecycleAlert {
  type: EmployeeLifecycleAlertType;
  employeeId: string;
  companyId: string;
  employeeNo: string;
  employeeName: string;
  dueDate?: string;
  daysRemaining?: number;
  severity: 'INFO' | 'WARNING' | 'URGENT' | 'EXPIRED';
}

const DAY_MS = 24 * 60 * 60 * 1000;

const parseDate = (value?: string): Date | null => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const addCalendarDays = (value: string, days: number): string | undefined => {
  const date = parseDate(value);
  if (!date) return undefined;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const daysUntil = (dueDate: string, now = new Date()): number | undefined => {
  const due = parseDate(dueDate);
  if (!due) return undefined;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.ceil((due.getTime() - today.getTime()) / DAY_MS);
};

const severityFor = (daysRemaining: number): EmployeeLifecycleAlert['severity'] => {
  if (daysRemaining < 0) return 'EXPIRED';
  if (daysRemaining <= 7) return 'URGENT';
  if (daysRemaining <= 30) return 'WARNING';
  return 'INFO';
};

export const getEmployeeLifecycleAlerts = (employees: Employee[], now = new Date()): EmployeeLifecycleAlert[] => {
  const alerts: EmployeeLifecycleAlert[] = [];

  for (const employee of employees) {
    if (employee.status === 'TERMINATED' || employee.status === 'ABSCONDED') continue;
    const base = {
      employeeId: employee.id,
      companyId: employee.companyId,
      employeeNo: employee.employeeNo,
      employeeName: `${employee.firstNameAr} ${employee.lastNameAr}`.trim(),
    };

    if (employee.nationality === 'NON_SAUDI') {
      if (employee.iqamaExpiryDate) {
        const remaining = daysUntil(employee.iqamaExpiryDate, now);
        if (remaining !== undefined && remaining <= 30) {
          alerts.push({ ...base, type: 'IQAMA_EXPIRY', dueDate: employee.iqamaExpiryDate, daysRemaining: remaining, severity: severityFor(remaining) });
        }
      } else if (employee.entryDate && employee.iqamaIssueStatus !== 'ISSUED') {
        const deadline = addCalendarDays(employee.entryDate, 90);
        const remaining = deadline ? daysUntil(deadline, now) : undefined;
        if (deadline && remaining !== undefined && remaining <= 30) {
          alerts.push({ ...base, type: 'NEW_HIRE_ENTRY_DEADLINE', dueDate: deadline, daysRemaining: remaining, severity: severityFor(remaining) });
        }
      }
    }

    if (employee.nationality === 'SAUDI' && employee.contractEndDate) {
      const remaining = daysUntil(employee.contractEndDate, now);
      if (remaining !== undefined && remaining <= 60) {
        alerts.push({ ...base, type: 'SAUDI_CONTRACT_EXPIRY', dueDate: employee.contractEndDate, daysRemaining: remaining, severity: remaining < 0 ? 'EXPIRED' : remaining <= 15 ? 'URGENT' : 'WARNING' });
      }
    }

    if (!employee.bankIban || employee.bankAccountStatus === 'PENDING') {
      alerts.push({ ...base, type: 'MISSING_BANK_ACCOUNT', severity: 'INFO' });
    }
  }

  return alerts;
};
