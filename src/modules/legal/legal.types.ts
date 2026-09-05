export const LEGAL_SLUGS = ['terms', 'privacy', 'cookies'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'contact' };

export type LegalSection = {
  id: string;
  title: string;
  blocks: LegalBlock[];
};

export type LegalCompany = {
  brand: string;
  entity: string;
  address: string;
  gstin: string;
  email: string;
  phone: string;
  websiteHref: string;
  websiteLabel: string;
};

export type LegalPage = {
  slug: LegalSlug;
  eyebrow: string;
  title: string;
  titleAccent: string;
  intro: string;
  effectiveDate: string;
  lastUpdated: string;
  sections: LegalSection[];
  updatedAt: string | null;
};
