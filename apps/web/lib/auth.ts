'use client';

import { apiFetch } from './api-client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

const TOKEN_KEY = 'lka_access_token';
const USER_KEY = 'lka_user';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredUser(user: AuthUser | null): void {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

export async function login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const result = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(result.token);
  setStoredUser(result.user);
  return result;
}

export async function logout(): Promise<void> {
  const token = getToken();
  await apiFetch('/api/auth/logout', { method: 'POST', token: token ?? undefined }).catch(() => {});
  setToken(null);
  setStoredUser(null);
}

export async function refreshToken(): Promise<{ token: string; user: AuthUser } | null> {
  // With cross-origin setup, httpOnly cookies don't work.
  // Check if we have a valid stored token instead.
  const stored = getToken();
  const user = getStoredUser();
  if (stored && user) {
    return { token: stored, user };
  }
  setToken(null);
  setStoredUser(null);
  return null;
}
