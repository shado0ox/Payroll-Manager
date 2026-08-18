import { AppState } from './storage';
import { UserAccount } from '../types';

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP_${response.status}`);
  return response.status === 204 ? undefined as T : response.json();
}

let stateVersion = 0;

export const api = {
  login: (companyCode: string, username: string, password: string) => request<{user: UserAccount; companyId: string}>('/api/auth/login', { method:'POST', body:JSON.stringify({ companyCode, username, password }) }),
  logout: () => request<void>('/api/auth/logout', { method:'POST' }),
  getState: async () => {
    const result = await request<{state: Partial<AppState> | null; version: number}>('/api/state');
    stateVersion = result.version;
    return result;
  },
  saveState: async (state: AppState) => {
    const result = await request<{version:number; updated_at:string}>('/api/state', { method:'PUT', body:JSON.stringify({ state, version: stateVersion }) });
    stateVersion = result.version;
    return result;
  },
  health: () => request<{status:string}>('/api/health'),
  saveUser: (user: UserAccount) => request<UserAccount>(`/api/users/${encodeURIComponent(user.id)}`, { method:'PUT', body:JSON.stringify(user) }),
  deleteUser: (id: string) => request<void>(`/api/users/${encodeURIComponent(id)}`, { method:'DELETE' }),
};
