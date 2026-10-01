/**
 * RSR Gym Centralized API Client
 * 
 * Features:
 * - 15-second network timeout via AbortController
 * - URL path normalization (prevents accidental /api/api/...)
 * - Health check verification
 * - Seamless live & demo state handling
 */

import API_URL from '../config/api';

export const REQUEST_TIMEOUT_MS = 15000;

/**
 * Normalizes base URL and path to ensure exactly one /api prefix and no double slashes.
 * Example:
 *   buildUrl('https://gym.com/api', '/members') -> 'https://gym.com/api/members'
 *   buildUrl('https://gym.com/api', '/api/members') -> 'https://gym.com/api/members'
 *   buildUrl('https://gym.com', 'members') -> 'https://gym.com/api/members'
 */
export function buildUrl(base: string, path: string): string {
  let cleanBase = (base || API_URL).trim().replace(/\/+$/, '');
  let cleanPath = (path || '').trim();

  if (!cleanPath.startsWith('/')) {
    cleanPath = `/${cleanPath}`;
  }

  // If base already includes /api and path starts with /api/, strip the duplicate
  if (cleanBase.endsWith('/api') && cleanPath.startsWith('/api/')) {
    cleanPath = cleanPath.slice(4); // Remove leading '/api'
  } else if (!cleanBase.endsWith('/api') && !cleanPath.startsWith('/api')) {
    cleanPath = `/api${cleanPath}`;
  }

  return `${cleanBase}${cleanPath}`;
}

export interface ApiRequestOptions extends RequestInit {
  token?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const {
    token,
    baseUrl = API_URL,
    timeoutMs = REQUEST_TIMEOUT_MS,
    headers = {},
    ...restOptions
  } = options;

  const url = buildUrl(baseUrl, path);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...restOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Bypass-Tunnel-Reminder': 'true',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data.error || data.message || `Request failed with HTTP status ${response.status}`;
      throw new Error(errorMsg);
    }

    return data as T;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Connection timed out (15s). The server took too long to respond.');
    }
    if (error.message && error.message.includes('Network request failed')) {
      throw new Error('Unable to connect to the RSR Gym server. Please check your internet connection or try again.');
    }
    throw error;
  }
}

/**
 * Health check endpoint test
 * Verifies backend connectivity before critical operations
 */
export async function checkBackendHealth(targetBaseUrl = API_URL): Promise<{ ok: boolean; message?: string }> {
  try {
    const url = buildUrl(targetBaseUrl, '/health');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Bypass-Tunnel-Reminder': 'true' },
    });
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));
    const isOk = res.ok && (data.status === 'ok' || data.success === true);
    return {
      ok: isOk,
      message: data.message || (isOk ? 'Server online' : 'Server returned error status'),
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || 'Server unreachable',
    };
  }
}

