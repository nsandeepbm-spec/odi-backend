/**
 * Public brand assets for email (not secrets).
 * Change links or Storage files here — do not put these in `.env`.
 */
const BRAND_STORAGE =
  'https://joiezvghtlyeyhuyvnwl.supabase.co/storage/v1/object/public/product-images/brand';

export const BRAND_LOGO_URL = `${BRAND_STORAGE}/odi-email-logo.png`;

export const BRAND_SOCIAL = [
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/odi3dstudio/',
    icon: `${BRAND_STORAGE}/email-instagram.png`,
  },
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/people/Oceaniek-Dimension-Industries/61589448369192/',
    icon: `${BRAND_STORAGE}/email-facebook.png`,
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/odistudioglobal',
    icon: `${BRAND_STORAGE}/email-linkedin.png`,
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/@ODI.STUDIO',
    icon: `${BRAND_STORAGE}/email-youtube.png`,
  },
] as const;
