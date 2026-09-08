import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import {
  DELHIVERY_API_PATHS,
  getDelhiveryBaseUrl,
  isDelhiveryConfigured,
} from './config.js';
import { fetchDelhiveryPost, normalizePincode } from './client.js';
import { delhiveryLabelAddressFromEnv } from './label-address.js';
import type { ParcelLine } from './shipping-charges.js';import { chargeableGramsForLines } from './shipping-charges.js';

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

function weightGramsString(lines: ParcelLine[]): string {
  const grams = chargeableGramsForLines(lines);
  return String(Math.max(50, Math.round(grams)));
}

/**
 * Delhivery B2C shipment creation (manifestation).
 *
 * POST {base}/api/cmu/create.json
 * Headers: Accept + Authorization Token + Content-Type application/json
 * Body (exactly as Delhivery curl):
 *   format=json&data={"shipments":[{...}],"pickup_location":{"name":"ODI Warehouse"}}
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
  const paymentMode = input.paymentMode === 'COD' ? 'COD' : 'Prepaid';
  const labelAddr = delhiveryLabelAddressFromEnv();

  const shipment = {
    name: input.consigneeName.slice(0, 120),
    add: input.address.slice(0, 500),
    pin,
    city: input.city.slice(0, 80),
    state: (input.state ?? '').slice(0, 80),
    country: (input.country ?? 'India').slice(0, 40),
    phone: input.phone.replace(/\D/g, '').slice(0, 15),
    order: input.orderNumber,
    payment_mode: paymentMode,
    return_pin: labelAddr.returnPin,
    return_city: labelAddr.returnCity,
    return_phone: labelAddr.returnPhone,
    return_add: labelAddr.returnAddress,
    return_state: labelAddr.returnState,
    return_country: labelAddr.returnCountry,
    products_desc: input.productsDesc.slice(0, 500),
    hsn_code: '',
    cod_amount: paymentMode === 'COD' ? String(Math.round(input.codAmountRupees ?? 0)) : '',
    order_date: null as string | null,
    total_amount: String(Math.round(input.totalAmountRupees)),
    seller_add: labelAddr.sellerAddress,
    seller_name: labelAddr.sellerName,
    seller_inv: '',    quantity: String(Math.max(1, input.quantity)),
    waybill,
    shipment_width: String(maxDimension(input.lines, 'width_cm')),
    shipment_height: String(maxDimension(input.lines, 'height_cm')),
    weight: weightGramsString(input.lines),
    shipping_mode: shippingModeLabel(),
    address_type: '',
  };

  const payload = {
    shipments: [shipment],
    pickup_location: { name: pickupName },
  };

  // Official curl: --data 'format=json&data={...}'  (JSON inside data is not extra-urlencoded)
  const formBody = `format=json&data=${JSON.stringify(payload)}`;
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
  const packageRemarks = Array.isArray(first?.remarks)
    ? first.remarks.filter((r): r is string => typeof r === 'string').join('; ')
    : typeof first?.remarks === 'string'
      ? first.remarks
      : null;
  const remarks =
    packageRemarks ||
    (typeof raw.rmk === 'string' ? raw.rmk : null);
  const errCode = typeof first?.err_code === 'string' ? first.err_code : null;

  if (!success || !pkgWaybill) {
    const rmkText = `${remarks ?? ''} ${String(raw.rmk ?? '')}`;
    let hint: string | undefined;
    if (rmkText.includes('ClientWarehouse')) {
      hint = `Invalid pickup location "${pickupName}". Set DELHIVERY_PICKUP_LOCATION_NAME to the exact warehouse name from Delhivery One (same token/environment as the Live API token).`;
    } else if (errCode === 'ER0005' || rmkText.toLowerCase().includes('suspicious')) {
      hint =
        'Delhivery flagged this as a suspicious test consignee (ER0005). Use a real customer name + valid 10-digit mobile (not 9999999999). Live checkout with real address data should work.';
    } else if (rmkText.toLowerCase().includes('insufficient balance')) {
      hint =
        'Delhivery wallet has insufficient balance to create a prepaid shipment. Top up the B2C account in Delhivery One (Billing / Wallet), then retry.';
    }
    throw ApiError.internal(hint ?? remarks ?? 'Delhivery shipment creation failed', {
      delhivery: raw,
      remarks,
      errCode,
      pickupLocation: pickupName,
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
