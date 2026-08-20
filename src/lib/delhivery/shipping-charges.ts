import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import {
  DELHIVERY_API_PATHS,
  getDelhiveryBaseUrl,
  getDelhiveryEnvironment,
  isDelhiveryConfigured,
} from './config.js';
import { fetchDelhiveryGet, normalizePincode } from './client.js';
import { expectedTatConfigHint } from './expected-tat.js';
import type { ProductRow } from '../../modules/products/products.types.js';

export type DelhiveryInvoiceChargesResponse = Record<string, unknown> | Array<Record<string, unknown>>;

export type ParcelLine = {
  weight_grams: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  quantity: number;
  name?: string;
};

export type ShippingChargesResult = {
  originPin: string;
  destinationPin: string;
  mot: 'E' | 'S';
  pt: string;
  chargeableGrams: number;
  shippingPaise: number;
  delhivery: DelhiveryInvoiceChargesResponse;
  requestUrl: string;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { value: ShippingChargesResult; expiresAt: number }>();

function cacheKey(origin: string, destination: string, mot: string, pt: string, grams: number) {
  return `${getDelhiveryEnvironment()}:${origin}:${destination}:${mot}:${pt}:${grams}`;
}

function cacheGet(key: string): ShippingChargesResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key: string, value: ShippingChargesResult) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function parseMot(value: string | undefined): 'E' | 'S' {
  const mot = (value ?? env.delhivery.mot).trim().toUpperCase();
  if (mot === 'E' || mot === 'EXPRESS') return 'E';
  return 'S';
}

function parsePaymentType(payment: 'prepaid' | 'cod' | undefined): string {
  if (payment === 'cod') return 'COD';
  return env.delhivery.pdt;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Delhivery volumetric divisor for cm: (L × W × H) / 5 = grams. */
function volumetricGrams(line: ParcelLine): number {
  const l = Number(line.length_cm);
  const w = Number(line.width_cm);
  const h = Number(line.height_cm);
  if (!(l > 0 && w > 0 && h > 0)) return 0;
  return Math.ceil((l * w * h) / 5) * Math.max(1, line.quantity);
}

export function chargeableGramsForLines(lines: ParcelLine[]): number {
  let grams = 0;
  for (const line of lines) {
    const qty = Math.max(1, line.quantity);
    const actual = (line.weight_grams ?? 0) * qty;
    grams += Math.max(actual, volumetricGrams(line));
  }
  return Math.max(0, Math.round(grams));
}

function extractTotalRupees(body: DelhiveryInvoiceChargesResponse): number | null {
  const rows = Array.isArray(body) ? body : [body];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;

    const headline = asNumber(row.total_amount) ?? asNumber(row.gross_amount) ?? asNumber(row.total_charge);
    if (headline !== null && headline > 0) return headline;

    let componentSum = 0;
    for (const [key, value] of Object.entries(row)) {
      if (!key.startsWith('charge_')) continue;
      componentSum += asNumber(value) ?? 0;
    }
    const taxData = row.tax_data;
    if (taxData && typeof taxData === 'object' && !Array.isArray(taxData)) {
      for (const value of Object.values(taxData as Record<string, unknown>)) {
        componentSum += asNumber(value) ?? 0;
      }
    }
    if (componentSum > 0) return componentSum;

    if (headline !== null) return headline;

    const nested = row.data;
    if (nested && typeof nested === 'object') {
      const fromNested = extractTotalRupees(
        Array.isArray(nested) ? (nested as Array<Record<string, unknown>>) : (nested as Record<string, unknown>)
      );
      if (fromNested !== null) return fromNested;
    }
  }
  return null;
}

function buildRequestUrl(
  originPin: string,
  destinationPin: string,
  mot: 'E' | 'S',
  pt: string,
  cgm: number
): { fetchUrl: string; publicUrl: string } {
  const params = new URLSearchParams({
    md: mot,
    ss: 'Delivered',
    o_pin: originPin,
    d_pin: destinationPin,
    cgm: String(cgm),
    pt,
  });
  const publicUrl = `${getDelhiveryBaseUrl()}${DELHIVERY_API_PATHS.invoiceCharges}?${params.toString()}`;
  const token = env.delhivery.apiKey?.trim();
  if (token) params.set('token', token);
  return {
    fetchUrl: `${getDelhiveryBaseUrl()}${DELHIVERY_API_PATHS.invoiceCharges}?${params.toString()}`,
    publicUrl,
  };
}

/**
 * Delhivery Invoice / Shipping Charge API
 * GET /api/kinko/v1/invoice/charges/.json?md={E|S}&ss=Delivered&o_pin={origin}&d_pin={dest}&cgm={grams}&pt=Pre-paid
 *
 * Origin pin = warehouse (`DELHIVERY_ORIGIN_PIN`). Destination = customer PIN.
 * Weight is chargeable grams from product weight / volumetric dimensions in DB.
 */
export async function getShippingCharges(input: {
  destinationPin: string;
  lines: ParcelLine[];
  payment?: 'prepaid' | 'cod';
  mot?: string;
}): Promise<ShippingChargesResult> {
  if (!isDelhiveryConfigured()) {
    throw ApiError.internal(
      'Delhivery is not configured — set DELHIVERY_STAGING_TOKEN (staging) or DELHIVERY_PRODUCTION_TOKEN (production)'
    );
  }

  const rawOrigin = (env.delhivery.originPin ?? '').trim();
  if (!rawOrigin) {
    throw ApiError.internal(`Shipping origin pin is not configured. ${expectedTatConfigHint()}`);
  }

  const originPin = normalizePincode(rawOrigin);
  const destinationPin = normalizePincode(input.destinationPin);
  const mot = parseMot(input.mot);
  const pt = parsePaymentType(input.payment);
  const chargeableGrams = chargeableGramsForLines(input.lines);

  if (chargeableGrams < 1) {
    const named = input.lines.find((l) => l.name)?.name;
    throw ApiError.badRequest(
      named
        ? `${named} is missing parcel weight. Add weight (g) in Admin → Products.`
        : 'Product parcel weight is missing. Add weight (g) in Admin → Products.'
    );
  }

  const key = cacheKey(originPin, destinationPin, mot, pt, chargeableGrams);
  const cached = cacheGet(key);
  if (cached) return cached;

  const { fetchUrl, publicUrl } = buildRequestUrl(originPin, destinationPin, mot, pt, chargeableGrams);
  const res = await fetchDelhiveryGet(fetchUrl);

  if (res.status === 401) {
    throw ApiError.internal(
      `Delhivery rejected the API token (401). Confirm DELHIVERY_STAGING_TOKEN / DELHIVERY_PRODUCTION_TOKEN matches DELHIVERY_ENV.`
    );
  }

  const text = await res.text();
  let delhivery: DelhiveryInvoiceChargesResponse;
  try {
    delhivery = text ? (JSON.parse(text) as DelhiveryInvoiceChargesResponse) : {};
  } catch {
    throw ApiError.internal('Invalid response from Delhivery shipping charges API', {
      status: res.status,
      body: text.slice(0, 500),
    });
  }

  if (!res.ok) {
    throw ApiError.internal('Delhivery shipping charges API error', { status: res.status, delhivery });
  }

  const rupees = extractTotalRupees(delhivery);
  if (rupees === null) {
    throw ApiError.internal('Delhivery shipping charges response did not include total_amount', {
      delhivery,
    });
  }

  const result: ShippingChargesResult = {
    originPin,
    destinationPin,
    mot,
    pt,
    chargeableGrams,
    shippingPaise: Math.max(0, Math.round(rupees * 100)),
    delhivery,
    requestUrl: publicUrl,
  };

  cacheSet(key, result);
  return result;
}

export function parcelLinesFromProducts(
  items: Array<{ product: ProductRow; quantity: number }>
): ParcelLine[] {
  return items.map((item) => ({
    weight_grams: item.product.weight_grams,
    length_cm: item.product.length_cm,
    width_cm: item.product.width_cm,
    height_cm: item.product.height_cm,
    quantity: item.quantity,
    name: item.product.name,
  }));
}
