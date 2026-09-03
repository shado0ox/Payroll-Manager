import { AppState } from './storage';
import { api } from './api';

export interface DatabaseStatus {
  isLocalConnected: boolean;
  isCloudConnected: boolean;
  isChecking: boolean;
  cloudEndpoint?: string;
  lastSavedAt: string | null;
  saveCount: number;
  engine: 'POSTGRESQL';
  storageSizeKb: number;
  recordSummary: {
    companies: number;
    employees: number;
    payrollRuns: number;
    attendance: number;
    loans: number;
    penalties: number;
    leaves: number;
    journals: number;
    auditLogs: number;
    users: number;
  };
  lastError: string | null;
}

// Ping & health check
export async function pingDatabase(): Promise<{ status: 'HEALTHY' | 'ERROR'; latencyMs: number; message: string }> {
  const start = performance.now();
  try {
    const result = await api.health();
    if (result.status !== 'ok') throw new Error('استجابة فحص الصحة غير صحيحة');

    const latency = Math.round(performance.now() - start);
    return {
      status: 'HEALTHY',
      latencyMs: latency,
      message: `الاتصال بخادم PostgreSQL يعمل بنجاح (زمن الاستجابة: ${latency}ms).`
    };
  } catch (err: any) {
    const latency = Math.round(performance.now() - start);
    return {
      status: 'ERROR',
      latencyMs: latency,
      message: `خطأ في الاتصال بقاعدة البيانات: ${err?.message || 'تعذر الوصول'}`
    };
  }
}

// Export Full Database Backup JSON
export function exportDatabaseBackup(state: AppState): void {
  const backupData = {
    appName: 'مسار - نظام مسيرات الرواتب والموارد البشرية',
    version: '2.0',
    exportDate: new Date().toISOString(),
    databaseFormat: 'MASAR_PAYROLL_JSON_DUMP',
    state,
  };

  const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backupData, null, 2))}`;
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', jsonString);
  downloadAnchor.setAttribute('download', `Masar_Payroll_DB_Backup_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
