import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { SEED_COMPANY, SEED_PAGES } from './legal.seed.js';
import type { LegalCompany, LegalPage, LegalSection, LegalSlug } from './legal.types.js';
import { LEGAL_SLUGS } from './legal.types.js';

const COMPANY_COLS =
  'id, brand, entity, address, gstin, email, phone, website_href, website_label, updated_at';
const PAGE_COLS =
  'slug, eyebrow, title, title_accent, intro, effective_date, last_updated, sections, updated_at, updated_by';

let seedPromise: Promise<void> | null = null;

function missingTablesError() {
  return ApiError.internal(
    'Legal tables are missing. Run sql/legal-pages.sql in the Supabase SQL Editor, then retry.'
  );
}

function isMissingTables(err: unknown): boolean {
  return err instanceof ApiError && err.message.startsWith('Legal tables are missing');
}

function isMissingRelation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = (err.message ?? '').toLowerCase();
  return err.code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache');
}

function throwDb(err: { code?: string; message?: string }) {
  if (isMissingRelation(err)) throw missingTablesError();
  throw err;
}

function serializeCompany(row: Record<string, unknown>): LegalCompany {
  return {
    brand: row.brand as string,
    entity: row.entity as string,
    address: row.address as string,
    gstin: row.gstin as string,
    email: row.email as string,
    phone: row.phone as string,
    websiteHref: row.website_href as string,
    websiteLabel: row.website_label as string,
  };
}

function serializePage(row: Record<string, unknown>): LegalPage {
  return {
    slug: row.slug as LegalSlug,
    eyebrow: row.eyebrow as string,
    title: row.title as string,
    titleAccent: (row.title_accent as string) ?? '',
    intro: row.intro as string,
    effectiveDate: row.effective_date as string,
    lastUpdated: row.last_updated as string,
    sections: (row.sections as LegalSection[]) ?? [],
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}

function companyInsertRow() {
  return {
    id: 1,
    brand: SEED_COMPANY.brand,
    entity: SEED_COMPANY.entity,
    address: SEED_COMPANY.address,
    gstin: SEED_COMPANY.gstin,
    email: SEED_COMPANY.email,
    phone: SEED_COMPANY.phone,
    website_href: SEED_COMPANY.websiteHref,
    website_label: SEED_COMPANY.websiteLabel,
  };
}

function pageInsertRow(page: (typeof SEED_PAGES)[number]) {
  return {
    slug: page.slug,
    eyebrow: page.eyebrow,
    title: page.title,
    title_accent: page.titleAccent,
    intro: page.intro,
    effective_date: page.effectiveDate,
    last_updated: page.lastUpdated,
    sections: page.sections,
  };
}

async function seedIfNeeded() {
  if (!seedPromise) {
    seedPromise = (async () => {
      const { data: company, error: companyErr } = await supabase
        .from('legal_company')
        .select('id')
        .eq('id', 1)
        .maybeSingle();
      if (companyErr) throwDb(companyErr);
      if (!company) {
        const { error } = await supabase.from('legal_company').upsert(companyInsertRow(), {
          onConflict: 'id',
          ignoreDuplicates: true,
        });
        if (error) throwDb(error);
      }

      const { data: pages, error: pagesErr } = await supabase.from('legal_pages').select('slug, sections');
      if (pagesErr) throwDb(pagesErr);

      const bySlug = new Map(
        ((pages ?? []) as { slug: string; sections: unknown }[]).map((p) => [p.slug, p])
      );

      const toInsert = SEED_PAGES.filter((p) => !bySlug.has(p.slug)).map(pageInsertRow);
      if (toInsert.length) {
        const { error } = await supabase.from('legal_pages').upsert(toInsert, {
          onConflict: 'slug',
          ignoreDuplicates: true,
        });
        if (error) throwDb(error);
      }

      const empty = SEED_PAGES.filter((p) => {
        const row = bySlug.get(p.slug);
        if (!row) return false;
        return !Array.isArray(row.sections) || row.sections.length === 0;
      });
      for (const page of empty) {
        const { error } = await supabase
          .from('legal_pages')
          .update({
            eyebrow: page.eyebrow,
            title: page.title,
            title_accent: page.titleAccent,
            intro: page.intro,
            effective_date: page.effectiveDate,
            last_updated: page.lastUpdated,
            sections: page.sections,
          })
          .eq('slug', page.slug);
        if (error) throwDb(error);
      }
    })().finally(() => {
      seedPromise = null;
    });
  }
  await seedPromise;
}

export type LegalPageInput = {
  eyebrow: string;
  title: string;
  titleAccent: string;
  intro: string;
  effectiveDate: string;
  lastUpdated: string;
  sections: LegalSection[];
};

export class LegalService {
  async getPublic(slug: LegalSlug): Promise<{ page: LegalPage; company: LegalCompany }> {
    try {
      await seedIfNeeded();
    } catch (err) {
      if (isMissingTables(err) || isMissingRelation(err as { code?: string; message?: string })) {
        const seed = SEED_PAGES.find((p) => p.slug === slug);
        if (!seed) throw ApiError.notFound('Legal page not found');
        return { page: { ...seed, updatedAt: null }, company: SEED_COMPANY };
      }
      throw err;
    }
    const [pageRes, companyRes] = await Promise.all([
      supabase.from('legal_pages').select(PAGE_COLS).eq('slug', slug).maybeSingle(),
      supabase.from('legal_company').select(COMPANY_COLS).eq('id', 1).maybeSingle(),
    ]);
    if (pageRes.error) throwDb(pageRes.error);
    if (companyRes.error) throwDb(companyRes.error);
    if (!pageRes.data) throw ApiError.notFound('Legal page not found');
    if (!companyRes.data) throw ApiError.notFound('Legal company details not found');
    return {
      page: serializePage(pageRes.data as Record<string, unknown>),
      company: serializeCompany(companyRes.data as Record<string, unknown>),
    };
  }

  async listAdmin(): Promise<{
    pages: Array<{
      slug: LegalSlug;
      title: string;
      titleAccent: string;
      effectiveDate: string;
      lastUpdated: string;
      updatedAt: string | null;
      sectionCount: number;
    }>;
    company: LegalCompany;
  }> {
    await seedIfNeeded();
    const [pagesRes, companyRes] = await Promise.all([
      supabase.from('legal_pages').select(PAGE_COLS).order('slug'),
      supabase.from('legal_company').select(COMPANY_COLS).eq('id', 1).maybeSingle(),
    ]);
    if (pagesRes.error) throwDb(pagesRes.error);
    if (companyRes.error) throwDb(companyRes.error);
    if (!companyRes.data) throw ApiError.notFound('Legal company details not found');

    const pages = ((pagesRes.data ?? []) as Record<string, unknown>[]).map((row) => {
      const page = serializePage(row);
      return {
        slug: page.slug,
        title: page.title,
        titleAccent: page.titleAccent,
        effectiveDate: page.effectiveDate,
        lastUpdated: page.lastUpdated,
        updatedAt: page.updatedAt,
        sectionCount: page.sections.length,
      };
    });

    const missing = LEGAL_SLUGS.filter((s) => !pages.some((p) => p.slug === s));
    if (missing.length) {
      await seedIfNeeded();
    }

    return {
      pages,
      company: serializeCompany(companyRes.data as Record<string, unknown>),
    };
  }

  async getAdmin(slug: LegalSlug) {
    return this.getPublic(slug);
  }

  async updatePage(slug: LegalSlug, input: LegalPageInput, updatedBy: string | null): Promise<LegalPage> {
    await seedIfNeeded();
    const { data, error } = await supabase
      .from('legal_pages')
      .update({
        eyebrow: input.eyebrow,
        title: input.title,
        title_accent: input.titleAccent,
        intro: input.intro,
        effective_date: input.effectiveDate,
        last_updated: input.lastUpdated,
        sections: input.sections,
        updated_by: updatedBy,
      })
      .eq('slug', slug)
      .select(PAGE_COLS)
      .maybeSingle();

    if (error) throwDb(error);
    if (!data) throw ApiError.notFound('Legal page not found');
    return serializePage(data as Record<string, unknown>);
  }

  async restorePage(slug: LegalSlug, updatedBy: string | null): Promise<LegalPage> {
    const seed = SEED_PAGES.find((p) => p.slug === slug);
    if (!seed) throw ApiError.notFound('Legal page not found');
    return this.updatePage(
      slug,
      {
        eyebrow: seed.eyebrow,
        title: seed.title,
        titleAccent: seed.titleAccent,
        intro: seed.intro,
        effectiveDate: seed.effectiveDate,
        lastUpdated: seed.lastUpdated,
        sections: seed.sections,
      },
      updatedBy
    );
  }

  async updateCompany(input: LegalCompany): Promise<LegalCompany> {
    await seedIfNeeded();
    const { data, error } = await supabase
      .from('legal_company')
      .update({
        brand: input.brand,
        entity: input.entity,
        address: input.address,
        gstin: input.gstin,
        email: input.email,
        phone: input.phone,
        website_href: input.websiteHref,
        website_label: input.websiteLabel,
      })
      .eq('id', 1)
      .select(COMPANY_COLS)
      .maybeSingle();

    if (error) throwDb(error);
    if (!data) throw ApiError.notFound('Legal company details not found');
    return serializeCompany(data as Record<string, unknown>);
  }
}

export const legalService = new LegalService();
