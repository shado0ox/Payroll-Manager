import { AppState } from './storage';
import { AttendanceRecord, Company, JournalBatch, LeaveRequest, LoanSchedule, PayrollRun, PayrollSettlement, PenaltyRecord, QoyodApiConfig, TemporaryEarningRecord, UserAccount } from '../types';

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError'; }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers } });
  if (!response.ok) throw new ApiError((await response.json().catch(() => ({}))).error || `HTTP_${response.status}`, response.status);
  return response.status === 204 ? undefined as T : response.json();
}

let stateVersion = 0;
let syncedState: Record<string, any> | null = null;
const MUTABLE_COLLECTIONS = ['companies', 'employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'payrollSettlements', 'journals'] as const;

function cloneState<T>(value: T): T {
  return value == null ? value : structuredClone(value);
}

function buildStatePatch(previous: Record<string, any> | null, next: Record<string, any>) {
  const collections: Record<string, { upsert: any[]; deleteIds: string[] }> = {};
  for (const key of MUTABLE_COLLECTIONS) {
    const oldItems = Array.isArray(previous?.[key]) ? previous![key] : [];
    const newItems = Array.isArray(next?.[key]) ? next[key] : [];
    const oldById = new Map(oldItems.filter((item: any) => item?.id).map((item: any) => [item.id, item]));
    const newById = new Map(newItems.filter((item: any) => item?.id).map((item: any) => [item.id, item]));
    const upsert = newItems.filter((item: any) => item?.id && JSON.stringify(oldById.get(item.id)) !== JSON.stringify(item));
    const deleteIds = oldItems.filter((item: any) => item?.id && !newById.has(item.id)).map((item: any) => item.id);
    if (upsert.length || deleteIds.length) collections[key] = { upsert, deleteIds };
  }
  const objects: Record<string, any> = {};
  if (JSON.stringify(previous?.qoyodConfig) !== JSON.stringify(next.qoyodConfig)) {
    objects.qoyodConfig = next.qoyodConfig;
  }
  return { collections, objects };
}

function updateSyncedCollection(key: string, record: any) {
  if (!syncedState) return;
  const collection = Array.isArray(syncedState[key]) ? [...syncedState[key]] : [];
  const index = collection.findIndex((item:any) => item?.id === record.id);
  if (index >= 0) collection[index] = cloneState(record);
  else collection.unshift(cloneState(record));
  syncedState = { ...syncedState, [key]: collection };
}

function removeFromSyncedCollection(key: string, id: string) {
  if (!syncedState) return;
  const collection = Array.isArray(syncedState[key]) ? syncedState[key].filter((item:any) => item?.id !== id) : [];
  syncedState = { ...syncedState, [key]: collection };
}

function withoutKeys(value: any, keys: string[]) {
  const copy = cloneState(value || {});
  for (const key of keys) delete copy[key];
  return copy;
}

function classifyPayrollCommand(previous: any, next: any) {
  if (!previous) return { kind:'aggregate' as const };
  if (previous.status !== next.status
    && JSON.stringify(withoutKeys(previous,['status','approvedAt','approvedBy','postedAt','postedBy'])) === JSON.stringify(withoutKeys(next,['status','approvedAt','approvedBy','postedAt','postedBy']))) {
    return { kind:'status' as const };
  }
  const oldBatches = Array.isArray(previous.paymentBatches) ? previous.paymentBatches : [];
  const newBatches = Array.isArray(next.paymentBatches) ? next.paymentBatches : [];
  const sameRunOutsideBatches = JSON.stringify(withoutKeys(previous,['paymentBatches'])) === JSON.stringify(withoutKeys(next,['paymentBatches']));
  if (sameRunOutsideBatches && newBatches.length === oldBatches.length + 1) {
    const added = newBatches.find((batch:any) => !oldBatches.some((candidate:any) => candidate.id === batch.id));
    if (added && oldBatches.every((batch:any) => JSON.stringify(batch) === JSON.stringify(newBatches.find((candidate:any) => candidate.id === batch.id)))) {
      return { kind:'createBatch' as const,batch:added };
    }
  }
  if (sameRunOutsideBatches && oldBatches.length === newBatches.length) {
    const changed = newBatches.filter((batch:any) => JSON.stringify(batch) !== JSON.stringify(oldBatches.find((candidate:any) => candidate.id === batch.id)));
    if (changed.length === 1 && oldBatches.some((batch:any) => batch.id === changed[0].id)) {
      return { kind:'batchStatus' as const,batch:changed[0] };
    }
  }
  return { kind:'aggregate' as const };
}

export const api = {
  publicConfig: () => request<{registrationEnabled:boolean; trialDays:number; developerContactPhone:string}>('/api/public/config'),
  startRegistration: (data: Record<string, unknown>) => request<{requestId:string; maskedEmail:string; expiresInSeconds:number}>('/api/auth/register/start', { method:'POST', body:JSON.stringify(data) }),
  verifyRegistration: (requestId: string, code: string) => request<{companyCode:string; username:string; trialEndsAt:string; trialDays:number}>('/api/auth/register/verify', { method:'POST', body:JSON.stringify({requestId,code}) }),
  updateSubscription: async (companyId:string,status:'TRIAL'|'ACTIVE'|'EXPIRED'|'SUSPENDED',endsAt:string|null) => {
    const result = await request<{record:Pick<Company,'id'|'subscriptionStatus'|'trialEndsAt'|'subscriptionEndsAt'>;version:number;updated_at:string}>(`/api/admin/companies/${encodeURIComponent(companyId)}/subscription`, { method:'PUT',body:JSON.stringify({status,endsAt}) });
    stateVersion = result.version;
    if (syncedState) {
      const company = (Array.isArray(syncedState.companies) ? syncedState.companies : []).find((item:any) => item?.id === companyId);
      if (company) updateSyncedCollection('companies',{ ...company,...result.record });
    }
    return result;
  },
  saveCompany: async (company: Company) => {
    const result = await request<{record:Company;version:number;updated_at:string}>(`/api/companies/${encodeURIComponent(company.id)}`, { method:'PUT',body:JSON.stringify(company) });
    stateVersion = result.version;
    updateSyncedCollection('companies',result.record);
    return result;
  },
  saveQoyodConfig: async (companyId: string,config: QoyodApiConfig) => {
    const result = await request<{record:QoyodApiConfig;version:number;updated_at:string}>('/api/integrations/qoyod/config', { method:'PUT',body:JSON.stringify({ companyId,config }) });
    stateVersion = result.version;
    if (syncedState) syncedState = { ...syncedState,qoyodConfig:cloneState(result.record) };
    return result;
  },
  saveEmployee: async (employee:any) => {
    const result = await request<{employee:any;created:boolean;version:number;updated_at:string}>(`/api/employees/${encodeURIComponent(employee.id)}`, { method:'PUT', body:JSON.stringify(employee) });
    stateVersion = result.version;
    if (syncedState) {
      const employees = Array.isArray(syncedState.employees) ? [...syncedState.employees] : [];
      const index = employees.findIndex((item:any) => item?.id === result.employee.id);
      if (index >= 0) employees[index] = cloneState(result.employee);
      else employees.push(cloneState(result.employee));
      syncedState = { ...syncedState, employees };
    }
    return result;
  },
  saveAttendanceRecord: async (record: AttendanceRecord) => {
    const result = await request<{record:AttendanceRecord;created:boolean;version:number;updated_at:string}>(`/api/attendance/${encodeURIComponent(record.id)}`, { method:'PUT', body:JSON.stringify(record) });
    stateVersion = result.version;
    updateSyncedCollection('attendance', result.record);
    return result;
  },
  deleteAttendanceRecord: async (id: string) => {
    const result = await request<{deleted:boolean;version:number;updated_at:string}>(`/api/attendance/${encodeURIComponent(id)}`, { method:'DELETE' });
    stateVersion = result.version;
    removeFromSyncedCollection('attendance', id);
    return result;
  },
  saveLeaveRequest: async (record: LeaveRequest) => {
    const result = await request<{record:LeaveRequest;created:boolean;version:number;updated_at:string}>(`/api/leaves/${encodeURIComponent(record.id)}`, { method:'PUT',body:JSON.stringify(record) });
    stateVersion = result.version;
    updateSyncedCollection('leaves',result.record);
    return result;
  },
  updateLeaveStatus: async (id: string,status: LeaveRequest['status']) => {
    const result = await request<{record:LeaveRequest;created:boolean;version:number;updated_at:string}>(`/api/leaves/${encodeURIComponent(id)}/status`, { method:'PATCH',body:JSON.stringify({ status }) });
    stateVersion = result.version;
    updateSyncedCollection('leaves',result.record);
    return result;
  },
  savePenaltyRecord: async (record: PenaltyRecord) => {
    const result = await request<{record:PenaltyRecord;created:boolean;version:number;updated_at:string}>(`/api/penalties/${encodeURIComponent(record.id)}`, { method:'PUT', body:JSON.stringify(record) });
    stateVersion = result.version;
    updateSyncedCollection('penalties', result.record);
    return result;
  },
  deletePenaltyRecord: async (id: string) => {
    const result = await request<{deleted:boolean;version:number;updated_at:string}>(`/api/penalties/${encodeURIComponent(id)}`, { method:'DELETE' });
    stateVersion = result.version;
    removeFromSyncedCollection('penalties', id);
    return result;
  },
  saveLoanRecord: async (record: LoanSchedule) => {
    const result = await request<{record:LoanSchedule;created:boolean;version:number;updated_at:string}>(`/api/loans/${encodeURIComponent(record.id)}`, { method:'PUT', body:JSON.stringify(record) });
    stateVersion = result.version;
    updateSyncedCollection('loans', result.record);
    return result;
  },
  deleteLoanRecord: async (id: string) => {
    const result = await request<{deleted:boolean;version:number;updated_at:string}>(`/api/loans/${encodeURIComponent(id)}`, { method:'DELETE' });
    stateVersion = result.version;
    removeFromSyncedCollection('loans', id);
    return result;
  },
  saveTemporaryEarningRecord: async (record: TemporaryEarningRecord) => {
    const result = await request<{record:TemporaryEarningRecord;created:boolean;version:number;updated_at:string}>(`/api/temporary-earnings/${encodeURIComponent(record.id)}`, { method:'PUT', body:JSON.stringify(record) });
    stateVersion = result.version;
    updateSyncedCollection('temporaryEarnings', result.record);
    return result;
  },
  deleteTemporaryEarningRecord: async (id: string) => {
    const result = await request<{deleted:boolean;version:number;updated_at:string}>(`/api/temporary-earnings/${encodeURIComponent(id)}`, { method:'DELETE' });
    stateVersion = result.version;
    removeFromSyncedCollection('temporaryEarnings', id);
    return result;
  },
  saveJournalRecord: async (record: JournalBatch) => {
    const result = await request<{record:JournalBatch;created:boolean;version:number;updated_at:string}>(`/api/journals/${encodeURIComponent(record.id)}`, { method:'PUT',body:JSON.stringify(record) });
    stateVersion = result.version;
    updateSyncedCollection('journals',result.record);
    return result;
  },
  createPayrollSettlement: async (record: PayrollSettlement) => {
    const result = await request<{record:PayrollSettlement;payrollRun:PayrollRun|null;version:number;updated_at:string}>('/api/payroll-settlements', { method:'POST',body:JSON.stringify(record) });
    stateVersion = result.version;
    updateSyncedCollection('payrollSettlements',result.record);
    if (result.payrollRun) updateSyncedCollection('payrollRuns',result.payrollRun);
    return result;
  },
  reversePayrollSettlement: async (id: string,reversalReason: string) => {
    const result = await request<{record:PayrollSettlement;payrollRun:PayrollRun|null;version:number;updated_at:string}>(`/api/payroll-settlements/${encodeURIComponent(id)}/reverse`, { method:'POST',body:JSON.stringify({ reversalReason }) });
    stateVersion = result.version;
    updateSyncedCollection('payrollSettlements',result.record);
    if (result.payrollRun) updateSyncedCollection('payrollRuns',result.payrollRun);
    return result;
  },
  deleteJournalRecord: async (id: string) => {
    const result = await request<{deleted:boolean;version:number;updated_at:string}>(`/api/journals/${encodeURIComponent(id)}`, { method:'DELETE' });
    stateVersion = result.version;
    removeFromSyncedCollection('journals',id);
    return result;
  },
  savePayrollRun: async (record: any) => {
    const previous = Array.isArray(syncedState?.payrollRuns) ? syncedState!.payrollRuns.find((item:any) => item?.id === record.id) : null;
    const command = classifyPayrollCommand(previous,record);
    let result;
    if (command.kind === 'status') {
      result = await request<{record:any;created:boolean;version:number;updated_at:string}>(`/api/payroll-runs/${encodeURIComponent(record.id)}/status`, { method:'POST',body:JSON.stringify({ status:record.status }) });
    } else if (command.kind === 'createBatch') {
      result = await request<{record:any;created:boolean;version:number;updated_at:string}>(`/api/payroll-runs/${encodeURIComponent(record.id)}/payment-batches`, { method:'POST',body:JSON.stringify(command.batch) });
    } else if (command.kind === 'batchStatus') {
      result = await request<{record:any;created:boolean;version:number;updated_at:string}>(`/api/payroll-runs/${encodeURIComponent(record.id)}/payment-batches/${encodeURIComponent(command.batch.id)}/status`, { method:'PATCH',body:JSON.stringify({ status:command.batch.status,paymentDate:command.batch.paymentDate,paymentReversalReason:command.batch.paymentReversalReason }) });
    } else {
      result = await request<{record:any;created:boolean;version:number;updated_at:string}>(`/api/payroll-runs/${encodeURIComponent(record.id)}`, { method:'PUT', body:JSON.stringify(record) });
    }
    stateVersion = result.version;
    updateSyncedCollection('payrollRuns', result.record);
    return result;
  },
  deleteEmployee: (employeeId:string) => request<{deleted:boolean;archived:boolean}>(`/api/employees/${encodeURIComponent(employeeId)}`, { method:'DELETE' }),
  passwordResetRequest: (email: string) => request<{ok:boolean;message:string}>('/api/auth/password-reset/request', { method:'POST', body:JSON.stringify({ email }) }),
  passwordResetConfirm: (token: string, password: string) => request<{ok:boolean}>('/api/auth/password-reset/confirm', { method:'POST', body:JSON.stringify({ token, password }) }),
  login: (companyCode: string, username: string, password: string) => request<{user: UserAccount; companyId: string}>('/api/auth/login', { method:'POST', body:JSON.stringify({ companyCode, username, password }) }),
  session: () => request<{user: UserAccount}>('/api/auth/session'),
  logout: () => request<void>('/api/auth/logout', { method:'POST' }),
  getState: async () => {
    const result = await request<{state: Partial<AppState> | null; version: number}>('/api/state');
    stateVersion = result.version;
    syncedState = result.state ? cloneState(result.state as Record<string, any>) : null;
    return result;
  },
  saveState: async (state: AppState) => {
    const snapshot = cloneState(state as unknown as Record<string, any>);
    const patch = buildStatePatch(syncedState, snapshot);
    if (!Object.keys(patch.collections).length && !Object.keys(patch.objects).length) {
      return { version: stateVersion, updated_at: new Date().toISOString() };
    }
    const result = await request<{version:number; updated_at:string}>('/api/state/patch', {
      method:'PATCH',
      body:JSON.stringify({ patch, version: stateVersion }),
    });
    stateVersion = result.version;
    syncedState = snapshot;
    return result;
  },
  health: () => request<{status:string}>('/api/health'),
  subscribeStateEvents: (onUpdate: (event: { version: number; updatedBy: string; updatedAt?: string }) => void) => {
    const source = new EventSource('/api/state/events', { withCredentials: true });
    source.onmessage = (message) => { try { onUpdate(JSON.parse(message.data)); } catch {} };
    return () => source.close();
  },
  saveUser: (user: UserAccount) => request<UserAccount>(`/api/users/${encodeURIComponent(user.id)}`, { method:'PUT', body:JSON.stringify(user) }),
  deleteUser: (id: string) => request<void>(`/api/users/${encodeURIComponent(id)}`, { method:'DELETE' }),
};
