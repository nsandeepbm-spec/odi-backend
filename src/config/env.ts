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

  /** Public site URL for email CTAs (local, ngrok, or production). */
  frontendUrl: (optional('FRONTEND_URL') ?? 'http://localhost:5173').replace(/\/$/, ''),

  mail: {
    from: optional('MAIL_FROM') ?? 'ODI <odistudio24@gmail.com>',
    /** Absolute HTTPS logo URL for email clients (Supabase Storage recommended). */
    logoUrl:
      optional('MAIL_LOGO_URL') ??
      'https://joiezvghtlyeyhuyvnwl.supabase.co/storage/v1/object/public/product-images/brand/odi-email-logo.png',
    instagramUrl: optional('MAIL_INSTAGRAM_URL'),
    linkedinUrl: optional('MAIL_LINKEDIN_URL'),
    youtubeUrl: optional('MAIL_YOUTUBE_URL'),
    facebookUrl: optional('MAIL_FACEBOOK_URL'),
    smtp: {
      host: optional('SMTP_HOST') ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: (process.env.SMTP_SECURE ?? 'true') !== 'false',
      user: optional('SMTP_USER'),
      // Gmail App Passwords are often pasted with spaces — strip them.
      pass: optional('SMTP_PASS')?.replace(/\s+/g, '') ?? null,
    },
  },

  /** Delhivery Express — staging vs production base URL + API token. */
  delhivery: (() => {
    const rawEnv = (optional('DELHIVERY_ENV') ?? 'staging').toLowerCase();
    const environment =
      rawEnv === 'production' || rawEnv === 'live' ? 'production' : 'staging';

    const stagingBaseUrl =
      optional('DELHIVERY_STAGING_BASE_URL') ?? 'https://staging-express.delhivery.com';
    const productionBaseUrl =
      optional('DELHIVERY_PRODUCTION_BASE_URL') ?? 'https://track.delhivery.com';

    return {
      apiKey: optional('DELHIVERY_API_KEY'),
      environment: environment as 'staging' | 'production',
      stagingBaseUrl: stagingBaseUrl.replace(/\/$/, ''),
      productionBaseUrl: productionBaseUrl.replace(/\/$/, ''),
      /** Resolved base URL for the active DELHIVERY_ENV. */
      baseUrl: (environment === 'production' ? productionBaseUrl : stagingBaseUrl).replace(
        /\/$/,
        ''
      ),
    };
  })(),
} as const;
