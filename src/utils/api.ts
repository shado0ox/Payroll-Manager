import { AppState } from './storage';
import { UserAccount } from '../types';

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

export const api = {
  publicConfig: () => request<{registrationEnabled:boolean; trialDays:number; developerContactPhone:string}>('/api/public/config'),
  startRegistration: (data: Record<string, unknown>) => request<{requestId:string; maskedEmail:string; expiresInSeconds:number}>('/api/auth/register/start', { method:'POST', body:JSON.stringify(data) }),
  verifyRegistration: (requestId: string, code: string) => request<{companyCode:string; username:string; trialEndsAt:string; trialDays:number}>('/api/auth/register/verify', { method:'POST', body:JSON.stringify({requestId,code}) }),
  updateSubscription: (companyId:string,status:'TRIAL'|'ACTIVE'|'EXPIRED'|'SUSPENDED',endsAt:string|null) => request(`/api/admin/companies/${encodeURIComponent(companyId)}/subscription`, { method:'PUT',body:JSON.stringify({status,endsAt}) }),
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
