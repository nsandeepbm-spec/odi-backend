import { ApiError } from '../../utils/ApiError.js';
import {
  DELHIVERY_API_PATHS,
  getDelhiveryAuthHeader,
  getDelhiveryBaseUrl,
  getDelhiveryEnvironment,
  isDelhiveryConfigured,
} from './config.js';

/** Normalised pincode serviceability result for ODI checkout/shipping. */
export type PincodeServiceability = {
  pincode: string;
  serviceable: boolean;
  prepaid: boolean;
  cod: boolean;
  /** Raw Delhivery payload slice (for debugging / future fields). */
  raw: Record<string, unknown> | null;
};

type DelhiveryPinResponse = {
  delivery_codes?: Array<{
    postal_code?: Record<string, unknown>;
  }>;
};

function yn(value: unknown): boolean {
  if (value === true) return true;
  if (value === false) return false;
  const s = String(value ?? '').trim().toUpperCase();
  return s === 'Y' || s === 'YES' || s === '1' || s === 'TRUE';
}

function normalizePincode(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length !== 6) {
    throw ApiError.badRequest('Pincode must be a 6-digit Indian postal code');
  }
  return digits;
}

/**
 * Delhivery Pin-code Serviceability API
 * GET /c/api/pin-codes/json/?filter_codes={pincode}  (production)
 * GET /c/api/pin-codes/json/?pincode={pincode}       (staging — Delhivery One B2C docs)
 *
 * @see https://one.delhivery.com/developer-portal/document/b2c/detail/pincode-serviceability
 */
export async function checkPincodeServiceability(pincodeInput: string): Promise<PincodeServiceability> {
  if (!isDelhiveryConfigured()) {
    throw ApiError.internal('Delhivery is not configured (missing DELHIVERY_API_KEY)');
  }

  const pincode = normalizePincode(pincodeInput);
  const base = getDelhiveryBaseUrl();
  const envName = getDelhiveryEnvironment();
  // Delhivery One B2C docs use ?pincode= on staging; legacy/readme uses ?filter_codes=
  const queryKey = envName === 'staging' ? 'pincode' : 'filter_codes';
  const url = `${base}${DELHIVERY_API_PATHS.pincodeServiceability}?${queryKey}=${encodeURIComponent(pincode)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: getDelhiveryAuthHeader(),
    });
  } catch (err) {
    throw ApiError.internal('Unable to reach Delhivery pincode service', {
      cause: err instanceof Error ? err.message : String(err),
    });
  }

  if (res.status === 401) {
    const hint =
      getDelhiveryEnvironment() === 'staging'
        ? ' Your token may be a production-only Delhivery One token — try DELHIVERY_ENV=production. Pincode check is read-only and does not create shipments.'
        : ' Confirm the token in Delhivery One → Settings → API Setup matches DELHIVERY_ENV.';
    throw ApiError.internal(
      `Delhivery authentication failed — check DELHIVERY_API_KEY and DELHIVERY_ENV.${hint}`
    );
  }

  const text = await res.text();
  let body: DelhiveryPinResponse;
  try {
    body = text ? (JSON.parse(text) as DelhiveryPinResponse) : {};
  } catch {
    throw ApiError.internal('Invalid response from Delhivery pincode API', { status: res.status });
  }

  if (!res.ok) {
    throw ApiError.internal('Delhivery pincode API error', { status: res.status, body });
  }

  const entry = body.delivery_codes?.[0]?.postal_code ?? null;
  if (!entry) {
    return {
      pincode,
      serviceable: false,
      prepaid: false,
      cod: false,
      raw: null,
    };
  }

  const prepaid = yn(entry.pre_paid ?? entry.prepaid);
  const cod = yn(entry.cod);
  const serviceable = prepaid || cod;

  return {
    pincode,
    serviceable,
    prepaid,
    cod,
    raw: entry,
  };
}
