import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import {
  DELHIVERY_API_PATHS,
  delhiveryStagingTokenRejectedHint,
  getDelhiveryBaseUrl,
  getDelhiveryEnvironment,
  isDelhiveryConfigured,
} from './config.js';
import { fetchDelhiveryPostJson, normalizePincode } from './client.js';
import { delhiveryLabelAddressFromEnv } from './label-address.js';

export type DelhiveryWarehouseInput = {
  /** Must equal DELHIVERY_PICKUP_LOCATION_NAME — this is what create.json looks up. */
  name: string;
  registeredName: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  phone: string;
  email: string;
  country?: string;
  returnAddress?: string;
  returnCity?: string;
  returnState?: string;
  returnPin?: string;
  returnCountry?: string;
};

export type DelhiveryWarehouseResult = {
  success: boolean;
  name: string;
  raw: Record<string, unknown>;
};

/**
 * Registers a pickup location (ClientWarehouse) under the account that owns the
 * current DELHIVERY token. Creating it this way is the only way to guarantee the
 * warehouse and the token belong to the same account + environment, which is what
 * `create.json` and `/fm/request/new/` validate against.
 */
export async function createDelhiveryWarehouse(
  input: DelhiveryWarehouseInput
): Promise<DelhiveryWarehouseResult> {
  return callWarehouseApi(DELHIVERY_API_PATHS.createWarehouse, input);
}

/** Same payload shape as create; Delhivery matches the existing warehouse on `name`. */
export async function editDelhiveryWarehouse(
  input: DelhiveryWarehouseInput
): Promise<DelhiveryWarehouseResult> {
  return callWarehouseApi(DELHIVERY_API_PATHS.editWarehouse, input);
}

async function callWarehouseApi(
  path: string,
  input: DelhiveryWarehouseInput
): Promise<DelhiveryWarehouseResult> {
  if (!isDelhiveryConfigured()) {
    throw ApiError.internal('Delhivery is not configured');
  }

  const name = input.name.trim();
  if (!name) {
    throw ApiError.badRequest('Warehouse name is required');
  }

  const pin = normalizePincode(input.pin);
  const country = input.country?.trim() || 'India';
  const phone = input.phone.replace(/\D/g, '').slice(-10);
  const labelAddr = delhiveryLabelAddressFromEnv();

  const body = {
    name,
    registered_name: input.registeredName.trim() || name,
    address: input.address.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    pin,
    country,
    phone,
    email: input.email.trim(),
    return_address: (input.returnAddress ?? labelAddr.returnAddress).trim(),
    return_city: (input.returnCity ?? labelAddr.returnCity).trim(),
    return_state: (input.returnState ?? labelAddr.returnState).trim(),
    return_pin: normalizePincode(input.returnPin ?? labelAddr.returnPin),
    return_country: (input.returnCountry ?? labelAddr.returnCountry).trim() || country,
  };

  const url = `${getDelhiveryBaseUrl()}${path}`;
  const res = await fetchDelhiveryPostJson(url, body);
  const text = await res.text();

  let raw: Record<string, unknown> = {};
  if (text) {
    try {
      raw = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw ApiError.internal('Invalid response from Delhivery warehouse API', {
        status: res.status,
        body: text.slice(0, 500),
      });
    }
  }

  if (!res.ok) {
    if (res.status === 401 && getDelhiveryEnvironment() === 'staging') {
      throw ApiError.internal(delhiveryStagingTokenRejectedHint(), {
        status: res.status,
        delhivery: raw,
        warehouse: name,
      });
    }
    throw ApiError.internal('Delhivery warehouse API error', {
      status: res.status,
      delhivery: raw,
      warehouse: name,
    });
  }

  // Delhivery returns { success: true, data: {...} } on create, or { error: [...] } on failure.
  const success = raw.success !== false && !raw.error;
  if (!success) {
    throw ApiError.badRequest('Delhivery rejected the warehouse', {
      delhivery: raw,
      warehouse: name,
    });
  }

  return { success: true, name, raw };
}

/** Reads warehouse details from env so the registered name always matches what we ship with. */
export function warehouseInputFromEnv(): DelhiveryWarehouseInput {
  const missing: string[] = [];
  const read = (key: string, value: string | null | undefined) => {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) missing.push(key);
    return trimmed;
  };

  const wh = env.delhivery.warehouse;
  const labelAddr = delhiveryLabelAddressFromEnv();
  const input: DelhiveryWarehouseInput = {
    name: read('DELHIVERY_PICKUP_LOCATION_NAME', env.delhivery.pickupLocationName),
    registeredName: read('DELHIVERY_WAREHOUSE_REGISTERED_NAME', wh.registeredName),
    address: read('DELHIVERY_WAREHOUSE_ADDRESS', wh.address),
    city: read('DELHIVERY_WAREHOUSE_CITY', wh.city),
    state: read('DELHIVERY_WAREHOUSE_STATE', wh.state),
    pin: read('DELHIVERY_ORIGIN_PIN', env.delhivery.originPin),
    phone: read('DELHIVERY_WAREHOUSE_PHONE', wh.phone),
    email: read('DELHIVERY_WAREHOUSE_EMAIL', wh.email),
    returnAddress: labelAddr.returnAddress,
    returnCity: labelAddr.returnCity,
    returnState: labelAddr.returnState,
    returnPin: labelAddr.returnPin,
    returnCountry: labelAddr.returnCountry,
  };

  if (missing.length) {
    throw ApiError.badRequest(
      `Missing warehouse config in .env: ${missing.join(', ')}`
    );
  }

  return input;
}
