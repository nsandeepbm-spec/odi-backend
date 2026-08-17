import { env } from '../../config/env.js';

export type DelhiveryEnvironment = 'staging' | 'production';

/** Delhivery Express API paths (relative to base URL). */
export const DELHIVERY_API_PATHS = {
  pincodeServiceability: '/c/api/pin-codes/json/',
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
    throw new Error('DELHIVERY_API_KEY is not configured');
  }
  return {
    Authorization: `Token ${key}`,
    Accept: 'application/json',
  };
}

export function isDelhiveryConfigured(): boolean {
  return Boolean(env.delhivery.apiKey);
}
