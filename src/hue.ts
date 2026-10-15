import type { Action } from './controller';
export type HueLight = { id: string; name: string; actions: (Action | 'Brightness')[] };
export async function hueRequest(path: string, token?: string, body?: unknown) {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Royalls-Client': 'dashboard', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Local backend request failed');
  return data;
}
