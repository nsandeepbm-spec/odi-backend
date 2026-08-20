import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import {
  DELHIVERY_API_PATHS,
  getDelhiveryBaseUrl,
  isDelhiveryConfigured,
} from './config.js';
import { fetchDelhiveryPost, normalizePincode } from './client.js';
import type { ParcelLine } from './shipping-charges.js';
import { chargeableGramsForLines } from './shipping-charges.js';

export type DelhiveryCreateShipmentInput = {
  orderNumber: string;
  consigneeName: string;
  address: string;
  pin: string;
  city: string;
  state?: string | null;
  country?: string | null;
  phone: string;
  paymentMode: 'Prepaid' | 'COD';
  codAmountRupees?: number;
  totalAmountRupees: number;
  quantity: number;
  productsDesc: string;
  lines: ParcelLine[];
  waybill?: string | null;
};

export type DelhiveryCreateShipmentResult = {
  success: boolean;
  waybill: string | null;
  packageStatus: string | null;
  remarks: string | null;
  raw: Record<string, unknown>;
};

function maxDimension(lines: ParcelLine[], key: 'length_cm' | 'width_cm' | 'height_cm'): number {
  let max = 0;
  for (const line of lines) {
    const v = Number(line[key]);
    if (v > max) max = v;
  }
  return max > 0 ? Math.ceil(max) : 10;
}

function shippingModeLabel(): string {
  const mot = (env.delhivery.mot ?? 'S').toUpperCase();
  return mot === 'E' || mot === 'EXPRESS' ? 'Express' : 'Surface';
}

function weightKgString(lines: ParcelLine[]): string {
  const grams = chargeableGramsForLines(lines);
  const kg = Math.max(0.5, grams / 1000);
  return kg.toFixed(2);
}

/**
 * Delhivery B2C shipment creation (manifestation).
 * POST /api/cmu/create.json
 * Body: format=json&data={ shipments, pickup_location }
 */
export async function createDelhiveryShipment(
  input: DelhiveryCreateShipmentInput
): Promise<DelhiveryCreateShipmentResult> {
  if (!isDelhiveryConfigured()) {
    throw ApiError.internal('Delhivery is not configured');
  }

  const pickupName = (env.delhivery.pickupLocationName ?? '').trim();
  if (!pickupName) {
    throw ApiError.internal(
      'DELHIVERY_PICKUP_LOCATION_NAME is not configured (registered warehouse name in Delhivery One)'
    );
  }

  const pin = normalizePincode(input.pin);
  const waybill = input.waybill?.trim() ?? '';

  const shipment: Record<string, string> = {
    name: input.consigneeName.slice(0, 120),
    add: input.address.slice(0, 500),
    pin,
    city: input.city.slice(0, 80),
    state: (input.state ?? '').slice(0, 80),
    country: (input.country ?? 'India').slice(0, 40),
    phone: input.phone.replace(/\D/g, '').slice(0, 15),
    order: input.orderNumber,
    payment_mode: input.paymentMode,
    return_pin: '',
    return_city: '',
    return_phone: '',
    return_add: '',
    return_state: '',
    return_country: '',
    products_desc: input.productsDesc.slice(0, 500),
    hsn_code: '',
    cod_amount: input.paymentMode === 'COD' ? String(Math.round(input.codAmountRupees ?? 0)) : '',
    order_date: '',
    total_amount: String(Math.round(input.totalAmountRupees)),
    seller_add: '',
    seller_name: '',
    seller_inv: '',
    quantity: String(Math.max(1, input.quantity)),
    waybill,
    shipment_width: String(maxDimension(input.lines, 'width_cm')),
    shipment_height: String(maxDimension(input.lines, 'height_cm')),
    shipment_length: String(maxDimension(input.lines, 'length_cm')),
    weight: weightKgString(input.lines),
    shipping_mode: shippingModeLabel(),
    address_type: '',
  };

  const payload = {
    shipments: [shipment],
    pickup_location: { name: pickupName },
  };

  const formBody = `format=json&data=${encodeURIComponent(JSON.stringify(payload))}`;
  const url = `${getDelhiveryBaseUrl()}${DELHIVERY_API_PATHS.createShipment}`;
  const res = await fetchDelhiveryPost(url, formBody);
  const text = await res.text();

  let raw: Record<string, unknown> = {};
  if (text) {
    try {
      raw = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw ApiError.internal('Invalid response from Delhivery create shipment API', {
        status: res.status,
        body: text.slice(0, 500),
      });
    }
  }

  if (!res.ok) {
    throw ApiError.internal('Delhivery create shipment API error', {
      status: res.status,
      delhivery: raw,
    });
  }

  const success = Boolean(raw.success);
  const packages = Array.isArray(raw.packages) ? raw.packages : [];
  const first = packages[0] as Record<string, unknown> | undefined;
  const pkgWaybill =
    typeof first?.waybill === 'string'
      ? first.waybill
      : typeof first?.waybill === 'number'
        ? String(first.waybill)
        : waybill || null;
  const packageStatus = typeof first?.status === 'string' ? first.status : null;
  const remarks =
    typeof first?.remarks === 'string'
      ? first.remarks
      : typeof raw.rmk === 'string'
        ? raw.rmk
        : null;

  if (!success || !pkgWaybill) {
    throw ApiError.internal('Delhivery shipment creation failed', {
      delhivery: raw,
      remarks,
    });
  }

  return {
    success,
    waybill: pkgWaybill,
    packageStatus,
    remarks,
    raw,
  };
}
