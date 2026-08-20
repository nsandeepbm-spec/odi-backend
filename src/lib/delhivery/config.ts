import { env } from '../../config/env.js';

export type DelhiveryEnvironment = 'staging' | 'production';

/** Delhivery Express API paths (relative to base URL). */
export const DELHIVERY_API_PATHS = {
  pincodeServiceability: '/c/api/pin-codes/json/',
  expectedTat: '/api/dc/expected_tat',
  invoiceCharges: '/api/kinko/v1/invoice/charges/.json',
  fetchWaybill: '/waybill/api/fetch/json/',
  createShipment: '/api/cmu/create.json',
} as const;

export function getDelhiveryBaseUrl(): string {
  return env.delhivery.baseUrl;
}

export function getDelhiveryEnvironment(): DelhiveryEnvironment {
  return env.delhivery.environment;
}

export function getDelhiveryAuthHeader(): Record<string, string> {
  const key = env.delhivery.apiKey;
  if (!key) {
    throw new Error('Delhivery API token is not configured');
  }
  const trimmed = key.trim();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  // Delhivery One v2 portal tokens are JWTs — use Bearer. Legacy Express keys are hex — use Token.
  if (trimmed.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${trimmed}`;
  } else {
    headers.Authorization = `Token ${trimmed}`;
  }
  return headers;
}

export function isDelhiveryConfigured(): boolean {
  return Boolean(env.delhivery.apiKey);
}

export function delhiveryConfigHint(): string {
  const envName = getDelhiveryEnvironment();
  if (isDelhiveryConfigured()) return '';
  return envName === 'production'
    ? 'Set DELHIVERY_PRODUCTION_TOKEN in .env (DELHIVERY_ENV=production).'
    : 'Set DELHIVERY_STAGING_TOKEN in .env (DELHIVERY_ENV=staging).';
}
