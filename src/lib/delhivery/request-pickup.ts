import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import {
  DELHIVERY_API_PATHS,
  getDelhiveryBaseUrl,
  isDelhiveryConfigured,
} from './config.js';
import { fetchDelhiveryPostJson } from './client.js';

export type DelhiveryPickupRequestInput = {
  /** YYYY-MM-DD */
  pickupDate: string;
  /** HH:MM:SS */
  pickupTime: string;
  expectedPackageCount: number;
  /** Override registered warehouse name; defaults to DELHIVERY_PICKUP_LOCATION_NAME */
  pickupLocation?: string;
};

export type DelhiveryPickupRequestResult = {
  pickupId: string;
  raw: Record<string, unknown>;
};

/**
 * Delhivery Pickup Request Creation API
 * POST /fm/request/new/
 *
 * @see https://delhivery-express-api-doc.readme.io/reference/pickup-request-creation-api
 */
export async function requestDelhiveryPickup(
  input: DelhiveryPickupRequestInput
): Promise<DelhiveryPickupRequestResult> {
  if (!isDelhiveryConfigured()) {
    throw ApiError.internal('Delhivery is not configured');
  }

  const pickupLocation = (
    input.pickupLocation ??
    env.delhivery.pickupLocationName ??
    ''
  ).trim();
  if (!pickupLocation) {
    throw ApiError.internal(
      'DELHIVERY_PICKUP_LOCATION_NAME is not configured (registered warehouse name in Delhivery One)'
    );
  }

  const count = Math.max(1, Math.floor(input.expectedPackageCount));
  // B2C Delhivery curl uses expected_package_count as a string.
  const body = {
    pickup_location: pickupLocation,
    expected_package_count: String(count),
    pickup_date: input.pickupDate,
    pickup_time: input.pickupTime,
  };

  const url = `${getDelhiveryBaseUrl()}${DELHIVERY_API_PATHS.pickupRequest}`;
  const res = await fetchDelhiveryPostJson(url, body);
  const text = await res.text();

  let raw: Record<string, unknown> = {};
  if (text) {
    try {
      raw = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw ApiError.internal('Invalid response from Delhivery pickup request API', {
        status: res.status,
        body: text.slice(0, 500),
      });
    }
  }

  if (!res.ok) {
    const message =
      typeof raw.error === 'string'
        ? raw.error
        : typeof raw.pickup_location === 'string'
          ? raw.pickup_location
          : typeof raw.detail === 'string'
            ? raw.detail
            : 'Delhivery pickup request failed';
    throw ApiError.badRequest(message, { status: res.status, delhivery: raw });
  }

  const pickupIdRaw = raw.pickup_id ?? raw.pickupId;
  const pickupId =
    typeof pickupIdRaw === 'number'
      ? String(pickupIdRaw)
      : typeof pickupIdRaw === 'string'
        ? pickupIdRaw.trim()
        : '';

  if (!pickupId) {
    throw ApiError.internal('Delhivery pickup response missing pickup_id', { delhivery: raw });
  }

  return { pickupId, raw };
}

/** Next-day default; B2C warehouse default slot is Mid Day (10:00–14:00). */
export function defaultPickupSchedule(now = new Date()): { pickupDate: string; pickupTime: string } {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return {
    pickupDate: `${yyyy}-${mm}-${dd}`,
    pickupTime: '12:15:00',
  };
}
