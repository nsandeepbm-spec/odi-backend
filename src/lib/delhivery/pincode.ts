import { ApiError } from '../../utils/ApiError.js';
import {
  DELHIVERY_API_PATHS,
  getDelhiveryBaseUrl,
  getDelhiveryEnvironment,
  isDelhiveryConfigured,
} from './config.js';
import { fetchDelhiveryGet, normalizePincode } from './client.js';

/** Exact upstream JSON shape from Delhivery pincode API. */
export type DelhiveryPinResponse = {
  delivery_codes?: Array<{
    postal_code?: Record<string, unknown>;
  }>;
};

/** Normalised pincode serviceability result + original Delhivery payload. */
export type PincodeServiceability = {
  pincode: string;
  serviceable: boolean;
  prepaid: boolean;
  cod: boolean;
  /** Unmodified JSON body from Delhivery (same as their API returns). */
  delhivery: DelhiveryPinResponse;
  /** Full upstream URL used for this lookup. */
  requestUrl: string;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { value: PincodeServiceability; expiresAt: number }>();

function yn(value: unknown): boolean {
  if (value === true) return true;
  if (value === false) return false;
  const s = String(value ?? '').trim().toUpperCase();
  return s === 'Y' || s === 'YES' || s === '1' || s === 'TRUE';
}

function cacheGet(pincode: string): PincodeServiceability | null {
  const key = `${getDelhiveryEnvironment()}:${pincode}`;
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(pincode: string, value: PincodeServiceability) {
  cache.set(`${getDelhiveryEnvironment()}:${pincode}`, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function logDelhiveryPincode(_requestUrl: string, _status: number, _body: DelhiveryPinResponse) {
  // Disabled — uncomment to debug Delhivery responses in the terminal.
  // const prefix = `[Delhivery pincode] ${getDelhiveryEnvironment()}`;
  // console.log(`${prefix} GET ${requestUrl}`);
  // console.log(`${prefix} HTTP ${status}`, JSON.stringify(body, null, 2));
}

/**
 * Delhivery Pin-code Serviceability API
 * GET /c/api/pin-codes/json/?filter_codes={pincode}
 *
 * Staging:    https://staging-express.delhivery.com/c/api/pin-codes/json/?filter_codes={pincode}
 * Production: https://track.delhivery.com/c/api/pin-codes/json/?filter_codes={pincode}
 *
 * @see https://one.delhivery.com/developer-portal/document/b2c/detail/pincode-serviceability
 */
export async function checkPincodeServiceability(pincodeInput: string): Promise<PincodeServiceability> {
  if (!isDelhiveryConfigured()) {
    throw ApiError.internal(
      'Delhivery is not configured — set DELHIVERY_STAGING_TOKEN (staging) or DELHIVERY_PRODUCTION_TOKEN (production)'
    );
  }

  const pincode = normalizePincode(pincodeInput);
  const cached = cacheGet(pincode);
  if (cached) return cached;

  const requestUrl = `${getDelhiveryBaseUrl()}${DELHIVERY_API_PATHS.pincodeServiceability}?filter_codes=${encodeURIComponent(pincode)}`;

  const res = await fetchDelhiveryGet(requestUrl);

  if (res.status === 401) {
    throw ApiError.internal(
      `Delhivery rejected the API token (401). Confirm DELHIVERY_STAGING_TOKEN / DELHIVERY_PRODUCTION_TOKEN matches DELHIVERY_ENV. Pincode check is read-only and does not create shipments.`
    );
  }

  const text = await res.text();
  let delhivery: DelhiveryPinResponse;
  try {
    delhivery = text ? (JSON.parse(text) as DelhiveryPinResponse) : { delivery_codes: [] };
  } catch {
    throw ApiError.internal('Invalid response from Delhivery pincode API', {
      status: res.status,
      body: text.slice(0, 500),
    });
  }

  logDelhiveryPincode(requestUrl, res.status, delhivery);

  if (!res.ok) {
    throw ApiError.internal('Delhivery pincode API error', { status: res.status, delhivery });
  }

  const entry = delhivery.delivery_codes?.[0]?.postal_code ?? null;
  const result: PincodeServiceability = !entry
    ? {
        pincode,
        serviceable: false,
        prepaid: false,
        cod: false,
        delhivery,
        requestUrl,
      }
    : {
        pincode,
        serviceable: yn(entry.pre_paid ?? entry.prepaid) || yn(entry.cod),
        prepaid: yn(entry.pre_paid ?? entry.prepaid),
        cod: yn(entry.cod),
        delhivery,
        requestUrl,
      };

  cacheSet(pincode, result);
  return result;
}
