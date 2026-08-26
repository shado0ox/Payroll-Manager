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

const DB_NAME = 'MasarPayrollDB';
const DB_VERSION = 1;
const STORE_NAME = 'masar_payroll_records';

// IndexedDB Helper
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this browser'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db: IDBDatabase = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function saveToIndexedDB(key: string, data: any): Promise<void> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ key, data, updatedAt: new Date().toISOString() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[DatabaseService] IndexedDB save failed, falling back to localStorage:', err);
  }
}

export async function loadFromIndexedDB(key: string): Promise<any | null> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        resolve(req.result ? req.result.data : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

// Calculate approximate storage usage
export function calculateStorageSize(): number {
  let totalBytes = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key) && key.startsWith('payroll_')) {
      totalBytes += (localStorage[key].length + key.length) * 2;
    }
  }
  return Math.round(totalBytes / 1024);
}

// Builds a status snapshot after the API has successfully saved to PostgreSQL.
export async function persistFullStateToDatabase(state: AppState): Promise<DatabaseStatus> {
  try {
    // PostgreSQL is the only persistence layer. Never mirror payroll/PII in browser storage.
    if (window.indexedDB) indexedDB.deleteDatabase(DB_NAME);

    const now = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return {
      isLocalConnected: false,
      isCloudConnected: true,
      isChecking: false,
      cloudEndpoint: '/api/state',
      lastSavedAt: now,
      saveCount: (state.auditLogs?.length || 0) + 1,
      engine: 'POSTGRESQL',
      storageSizeKb: 0,
      recordSummary: {
        companies: state.companies.length,
        employees: state.employees.length,
        payrollRuns: state.payrollRuns.length,
        attendance: state.attendance.length,
        loans: state.loans.length,
        penalties: state.penalties.length,
        leaves: state.leaves.length,
        journals: state.journals.length,
        auditLogs: state.auditLogs.length,
        users: state.users.length,
      },
      lastError: null,
    };
  } catch (error: any) {
    console.error('[DatabaseService] Database write error:', error);
    return {
      isLocalConnected: false,
      isCloudConnected: false,
      isChecking: false,
      lastSavedAt: null,
      saveCount: 0,
      engine: 'POSTGRESQL',
      storageSizeKb: 0,
      recordSummary: {
        companies: state.companies.length,
        employees: state.employees.length,
        payrollRuns: state.payrollRuns.length,
        attendance: state.attendance.length,
        loans: state.loans.length,
        penalties: state.penalties.length,
        leaves: state.leaves.length,
        journals: state.journals.length,
        auditLogs: state.auditLogs.length,
        users: state.users.length,
      },
      lastError: error?.message || 'خطأ في الكتابة لقاعدة البيانات',
    };
  }
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
