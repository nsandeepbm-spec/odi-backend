// Central, validated environment access. Fail fast on missing config.

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}. Copy .env.example to .env and fill it in.`);
  }
  return value;
};

const optional = (key: string): string | null => {
  const value = process.env[key];
  return value && value.trim() ? value.trim() : null;
};

const port = Number(process.env.PORT ?? 5000);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const parseTrustProxy = (value: string | undefined): boolean | number => {
  if (!value || value === 'false') return false;
  if (value === 'true') return true;

  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error('TRUST_PROXY must be true, false, or a non-negative integer hop count');
  }
  return hops;
};

export const env = {
  port,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),

  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  firebase: {
    projectId: required('FIREBASE_PROJECT_ID'),
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? null,
  },

  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'product-images',
  },

  razorpay: {
    keyId: optional('RAZORPAY_KEY_ID'),
    keySecret: optional('RAZORPAY_KEY_SECRET'),
    webhookSecret: optional('RAZORPAY_WEBHOOK_SECRET'),
  },
} as const;
