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

export const api = {
  login: (companyCode: string, username: string, password: string) => request<{user: UserAccount; companyId: string}>('/api/auth/login', { method:'POST', body:JSON.stringify({ companyCode, username, password }) }),
  session: () => request<{user: UserAccount}>('/api/auth/session'),
  logout: () => request<void>('/api/auth/logout', { method:'POST' }),
  getState: async () => {
    const result = await request<{state: Partial<AppState> | null; version: number}>('/api/state');
    stateVersion = result.version;
    return result;
  },
  saveState: async (state: AppState) => {
    const put = () => request<{version:number; updated_at:string}>('/api/state', { method:'PUT', body:JSON.stringify({ state, version: stateVersion }) });
    try {
      const result = await put(); stateVersion = result.version; return result;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || state.currentUser?.role === 'ADMIN') throw error;
      const latest = await request<{state: Partial<AppState> | null; version: number}>('/api/state');
      stateVersion = latest.version;
      const result = await put(); stateVersion = result.version; return result;
    }
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
