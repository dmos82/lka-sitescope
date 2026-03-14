'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';

// Paths that do NOT need a CSRF token (they establish the session)
const CSRF_EXEMPT_PATHS = new Set(['/api/auth/login', '/api/auth/refresh']);

// Cached CSRF token (single-use on the server, but we re-fetch after each use)
let _csrfToken: string | null = null;

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/csrf-token`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch CSRF token');
  const data = (await res.json()) as { csrf_token: string };
  return data.csrf_token;
}

interface FetchOptions extends RequestInit {
  token?: string;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { token, ...rest } = options;
  const method = (rest.method ?? 'GET').toUpperCase();
  const needsCsrf =
    ['POST', 'PATCH', 'DELETE', 'PUT'].includes(method) &&
    !CSRF_EXEMPT_PATHS.has(path);

  if (needsCsrf) {
    // Always get a fresh token (server tokens are single-use)
    _csrfToken = await fetchCsrfToken();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((rest.headers as Record<string, string>) ?? {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (needsCsrf && _csrfToken) {
    headers['X-CSRF-Token'] = _csrfToken;
    _csrfToken = null; // consumed
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    // Auto-redirect to login on expired/invalid token
    if (res.status === 401 && typeof window !== 'undefined' && !path.includes('/auth/')) {
      localStorage.removeItem('lka_access_token');
      localStorage.removeItem('lka_user');
      window.location.href = '/login';
      throw new Error('Session expired — redirecting to login');
    }
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((error as { error?: string }).error ?? `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}
