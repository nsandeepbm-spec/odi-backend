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
export async function fetchDelhiveryGet(url: string): Promise<Response> {
  try {
    let res = await fetch(url, { method: 'GET', headers: getDelhiveryAuthHeader() });
    const key = env.delhivery.apiKey?.trim() ?? '';
    if (res.status === 401 && key.startsWith('eyJ')) {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Token ${key}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });
    }
    return res;
  } catch (err) {
    throw ApiError.internal('Unable to reach Delhivery API', {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}

/** POST helper for CMU / manifestation APIs (`format=json&data=…`). */
export async function fetchDelhiveryPost(url: string, formBody: string): Promise<Response> {
  try {
    const baseHeaders = getDelhiveryAuthHeader();
    const headers: Record<string, string> = {
      ...baseHeaders,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };

    let res = await fetch(url, { method: 'POST', headers, body: formBody });
    const key = env.delhivery.apiKey?.trim() ?? '';
    if (res.status === 401 && key.startsWith('eyJ')) {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${key}`,
          'Content-Type': 'application/x-www-form-urlencoded',
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
