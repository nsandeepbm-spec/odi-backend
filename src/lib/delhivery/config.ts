import { env } from '../../config/env.js';

export type DelhiveryEnvironment = 'staging' | 'production';

/** Delhivery Express API paths (relative to base URL). */
export const DELHIVERY_API_PATHS = {
  pincodeServiceability: '/c/api/pin-codes/json/',
  expectedTat: '/api/dc/expected_tat',
  invoiceCharges: '/api/kinko/v1/invoice/charges/.json',
  fetchWaybill: '/waybill/api/fetch/json/',
  createShipment: '/api/cmu/create.json',
  /** Same path as edit; cancel uses body { waybill, cancellation: "true" }. */
  editOrCancelShipment: '/api/p/edit',
  pickupRequest: '/fm/request/new/',
  packingSlip: '/api/p/packing_slip',
  trackShipment: '/api/v1/packages/json/',
  createWarehouse: '/api/backend/clientwarehouse/create/',
  editWarehouse: '/api/backend/clientwarehouse/edit/',
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
  // B2C Express uses a hex Live/API token (`Authorization: Token …`).
  // Delhivery One login JWTs (`eyJ…`) belong to B2B and will not see the B2C warehouse.
  if (env.delhivery.accountType === 'b2c' && trimmed.startsWith('eyJ')) {
    throw new Error(
      'DELHIVERY_ACCOUNT_TYPE=b2c but the token is a JWT (B2B). Use the B2C hex token in DELHIVERY_PRODUCTION_TOKEN, or set ACCOUNT_TYPE=b2b for staging.'
    );
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
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

/** Staging host rejected the token (B2C Live keys are not valid on staging-express). */
export function delhiveryStagingTokenRejectedHint(): string {
  return (
    'Delhivery staging returned 401 Invalid token. Your B2C hex key is Live-only ' +
    '(track.delhivery.com) and is not registered on staging-express.delhivery.com. ' +
    'Ask Delhivery for a B2C UAT/staging token, or set DELHIVERY_ENV=production to test against live (wallet required).'
  );
}

export function delhiveryConfigHint(): string {
  const envName = getDelhiveryEnvironment();
  if (isDelhiveryConfigured()) return '';
  return envName === 'production'
    ? 'Set DELHIVERY_PRODUCTION_TOKEN (B2C hex Live API Token) with DELHIVERY_ENV=production.'
    : 'Set DELHIVERY_STAGING_TOKEN (B2B JWT) and DELHIVERY_ACCOUNT_TYPE=b2b for staging-express.';
}

/** One-line boot log — never includes the token. */
export function delhiveryBootSummary(): string {
  const { environment, accountType, baseUrl, pickupLocationName } = env.delhivery;
  const tokenKind = env.delhivery.apiKey?.startsWith('eyJ')
    ? 'jwt-b2b'
    : env.delhivery.apiKey
      ? 'hex-b2c'
      : 'missing';
  return `Delhivery ${environment} ${accountType} ${baseUrl} pickup="${pickupLocationName ?? ''}" token=${tokenKind}`;
}
