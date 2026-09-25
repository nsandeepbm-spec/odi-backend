import { setDefaultResultOrder } from 'node:dns';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import { getDelhiveryAuthHeader } from './config.js';

/**
 * Prefer IPv4 when Delhivery host has A+AAAA — Windows/ISP IPv6 hangs often
 * surface as Undici `fetch failed` / connect timeout (~10–15s).
 */
try {
  setDefaultResultOrder('ipv4first');
} catch {
  /* Node < 17 — ignore */
}

const NETWORK_RETRIES = 3;
const RETRY_BASE_MS = 400;

export function normalizePincode(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length !== 6) {
    throw ApiError.badRequest('Pincode must be a 6-digit Indian postal code');
  }
  return digits;
}

function networkCause(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    parts.push(cause.message);
    const code = (cause as Error & { code?: string }).code;
    if (code) parts.push(code);
  } else if (cause != null) {
    parts.push(String(cause));
  }
  return parts.filter(Boolean).join(' · ');
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withNetworkRetry(label: string, run: () => Promise<Response>): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= NETWORK_RETRIES; attempt++) {
    try {
      return await run();
    } catch (err) {
      lastErr = err;
      if (attempt < NETWORK_RETRIES) {
        await sleep(RETRY_BASE_MS * attempt);
        continue;
      }
    }
  }
  throw ApiError.internal(
    'Unable to reach Delhivery API — shipping is temporarily unavailable. Please try again in a moment.',
    { cause: networkCause(lastErr), label, attempts: NETWORK_RETRIES }
  );
}

/** GET helper with Bearer/Token auth and one retry on 401 for JWT tokens. */
export async function fetchDelhiveryGet(
  url: string,
  options?: { accept?: string }
): Promise<Response> {
  return withNetworkRetry('GET', async () => {
    const accept = options?.accept ?? 'application/json';
    const base = getDelhiveryAuthHeader();
    const headers: Record<string, string> = {
      ...base,
      Accept: accept,
    };
    // For PDF downloads, don't force JSON content-type
    if (accept.includes('pdf') || accept === '*/*') {
      delete headers['Content-Type'];
    }

    let res = await fetch(url, { method: 'GET', headers });
    const key = env.delhivery.apiKey?.trim() ?? '';
    if (res.status === 401 && key.startsWith('eyJ')) {
      const retryHeaders: Record<string, string> = {
        Authorization: `Token ${key}`,
        Accept: accept,
      };
      res = await fetch(url, { method: 'GET', headers: retryHeaders });
    }
    return res;
  });
}

/** POST helper for CMU create (`format=json&data=…` body, matches Delhivery curl). */
export async function fetchDelhiveryPost(url: string, formBody: string): Promise<Response> {
  return withNetworkRetry('POST', async () => {
    const baseHeaders = getDelhiveryAuthHeader();
    const headers: Record<string, string> = {
      ...baseHeaders,
      // Delhivery docs use application/json with form-style body string.
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    let res = await fetch(url, { method: 'POST', headers, body: formBody });
    const key = env.delhivery.apiKey?.trim() ?? '';
    if (res.status === 401 && key.startsWith('eyJ')) {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: formBody,
      });
    }
    return res;
  });
}

/** POST JSON helper (pickup request, etc.). */
export async function fetchDelhiveryPostJson(url: string, body: unknown): Promise<Response> {
  return withNetworkRetry('POST_JSON', async () => {
    const baseHeaders = getDelhiveryAuthHeader();
    const headers: Record<string, string> = {
      ...baseHeaders,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const payload = JSON.stringify(body);

    let res = await fetch(url, { method: 'POST', headers, body: payload });
    const key = env.delhivery.apiKey?.trim() ?? '';
    if (res.status === 401 && key.startsWith('eyJ')) {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: payload,
      });
    }
    return res;
  });
}
