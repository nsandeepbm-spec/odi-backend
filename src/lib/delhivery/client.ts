import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import { getDelhiveryAuthHeader } from './config.js';

export function normalizePincode(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length !== 6) {
    throw ApiError.badRequest('Pincode must be a 6-digit Indian postal code');
  }
  return digits;
}

/** GET helper with Bearer/Token auth and one retry on 401 for JWT tokens. */
export async function fetchDelhiveryGet(
  url: string,
  options?: { accept?: string }
): Promise<Response> {
  try {
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
  } catch (err) {
    throw ApiError.internal('Unable to reach Delhivery API', {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}

/** POST helper for CMU create (`format=json&data=…` body, matches Delhivery curl). */
export async function fetchDelhiveryPost(url: string, formBody: string): Promise<Response> {
  try {
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
  } catch (err) {
    throw ApiError.internal('Unable to reach Delhivery API', {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}

/** POST JSON helper (pickup request, etc.). */
export async function fetchDelhiveryPostJson(url: string, body: unknown): Promise<Response> {
  try {
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
  } catch (err) {
    throw ApiError.internal('Unable to reach Delhivery API', {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}
