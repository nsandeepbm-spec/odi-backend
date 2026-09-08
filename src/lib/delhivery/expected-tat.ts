import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import {
  DELHIVERY_API_PATHS,
  getDelhiveryBaseUrl,
  getDelhiveryEnvironment,
  isDelhiveryConfigured,
} from './config.js';
import { fetchDelhiveryGet, normalizePincode } from './client.js';

/** Upstream JSON from Delhivery Expected TAT API (shape varies by account/version). */
export type DelhiveryExpectedTatResponse = Record<string, unknown>;

export type ExpectedTatResult = {
  originPin: string;
  destinationPin: string;
  mot: 'E' | 'S';
  pdt: string;
  /** Estimated transit days when Delhivery returns a numeric TAT. */
  days: number | null;
  /** Human-readable label for checkout UI. */
  label: string;
  delhivery: DelhiveryExpectedTatResponse;
  requestUrl: string;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { value: ExpectedTatResult; expiresAt: number }>();

function cacheKey(origin: string, destination: string, mot: string) {
  return `${getDelhiveryEnvironment()}:${origin}:${destination}:${mot}`;
}

function cacheGet(key: string): ExpectedTatResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key: string, value: ExpectedTatResult) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function parseMot(value: string | undefined): 'E' | 'S' {
  const mot = (value ?? env.delhivery.mot).trim().toUpperCase();
  if (mot === 'E' || mot === 'EXPRESS') return 'E';
  return 'S';
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

function extractDays(body: DelhiveryExpectedTatResponse): number | null {
  const direct = [
    body.tat,
    body.expected_tat,
    body.tat_days,
    body.days,
    body.expected_days,
  ];
  for (const candidate of direct) {
    const days = asNumber(candidate);
    if (days !== null && days >= 0) return days;
  }

  const nested = body.data;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return extractDays(nested as DelhiveryExpectedTatResponse);
  }

  return null;
}

function formatLabel(days: number | null): string {
  if (days === null) return 'Delivery estimate unavailable';
  if (days <= 0) return 'Delivered in 1 business day';
  if (days === 1) return 'Delivered in 1 business day';
  return `Delivered in ${days} business days`;
}

function buildRequestUrl(originPin: string, destinationPin: string, mot: 'E' | 'S'): string {
  const params = new URLSearchParams({
    origin_pin: originPin,
    destination_pin: destinationPin,
    mot,
    pdt: env.delhivery.pdt,
  });
  const token = env.delhivery.apiKey?.trim();
  if (token) params.set('token', token);
  return `${getDelhiveryBaseUrl()}${DELHIVERY_API_PATHS.expectedTat}?${params.toString()}`;
}

/**
 * Delhivery Expected TAT API
 * GET /api/dc/expected_tat?origin_pin={origin}&destination_pin={dest}&mot={E|S}&pdt=Pre-paid
 *
 * Staging:    https://staging-express.delhivery.com/api/dc/expected_tat?...
 * Production: https://track.delhivery.com/api/dc/expected_tat?...
 *
 * Origin pin = your registered Delhivery pickup warehouse PIN (`DELHIVERY_ORIGIN_PIN`).
 * Destination pin = customer's shipping address PIN.
 */
export async function getExpectedTat(
  destinationPinInput: string,
  options?: { originPin?: string; mot?: string }
): Promise<ExpectedTatResult> {
  if (!isDelhiveryConfigured()) {
    throw ApiError.internal(
      'Delhivery is not configured — set DELHIVERY_STAGING_TOKEN (staging) or DELHIVERY_PRODUCTION_TOKEN (production)'
    );
  }

  const rawOrigin = (options?.originPin ?? env.delhivery.originPin ?? '').trim();
  if (!rawOrigin) {
    throw ApiError.internal(`Shipping origin pin is not configured. ${expectedTatConfigHint()}`);
  }

  const originPin = normalizePincode(rawOrigin);
  const destinationPin = normalizePincode(destinationPinInput);
  const mot = parseMot(options?.mot);

  const key = cacheKey(originPin, destinationPin, mot);
  const cached = cacheGet(key);
  if (cached) return cached;

  const requestUrl = buildRequestUrl(originPin, destinationPin, mot);
  const res = await fetchDelhiveryGet(requestUrl);

  if (res.status === 401) {
    throw ApiError.internal(
      `Delhivery rejected the API token (401). Confirm DELHIVERY_STAGING_TOKEN / DELHIVERY_PRODUCTION_TOKEN matches DELHIVERY_ENV.`
    );
  }

  const text = await res.text();
  let delhivery: DelhiveryExpectedTatResponse;
  try {
    delhivery = text ? (JSON.parse(text) as DelhiveryExpectedTatResponse) : {};
  } catch {
    throw ApiError.internal('Invalid response from Delhivery Expected TAT API', {
      status: res.status,
      body: text.slice(0, 500),
    });
  }

  if (!res.ok) {
    throw ApiError.internal('Delhivery Expected TAT API error', { status: res.status, delhivery });
  }

  const days = extractDays(delhivery);
  const result: ExpectedTatResult = {
    originPin,
    destinationPin,
    mot,
    pdt: env.delhivery.pdt,
    days,
    label: formatLabel(days),
    delhivery,
    requestUrl,
  };

  cacheSet(key, result);
  return result;
}

export function isExpectedTatConfigured(): boolean {
  return Boolean(env.delhivery.originPin?.trim());
}

export function expectedTatConfigHint(): string {
  return isExpectedTatConfigured()
    ? ''
    : 'Set DELHIVERY_ORIGIN_PIN in .env to your registered Delhivery warehouse / pickup location PIN.';
}
