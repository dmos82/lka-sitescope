'use client';

import { apiFetch } from './api-client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

let _token: string | null = null;

export function getToken(): string | null {
  return _token;
}

export function setToken(token: string | null): void {
  _token = token;
}

export async function login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const result = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(result.token);
  return result;
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST', token: _token ?? undefined }).catch(() => {});
  setToken(null);
}

export async function refreshToken(): Promise<{ token: string; user: AuthUser } | null> {
  try {
    const result = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/refresh', {
      method: 'POST',
    });
    setToken(result.token);
    return result;
  } catch {
    setToken(null);
    return null;
  }
}
