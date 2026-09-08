import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { clampPage, clampPerPage, paginationMeta } from '../../lib/pagination.js';

const CONTACT_COLS =
  'id, name, email, company, service, message, status, admin_note, created_at, updated_at';
const CAREER_COLS =
  'id, full_name, email, phone, role, portfolio_url, cover_note, status, admin_note, created_at, updated_at';

function serializeContact(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    company: (row.company as string | null) ?? null,
    service: row.service as string,
    message: row.message as string,
    status: row.status as string,
    admin_note: (row.admin_note as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function serializeCareer(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    full_name: row.full_name as string,
    email: row.email as string,
    phone: (row.phone as string | null) ?? null,
    role: row.role as string,
    portfolio_url: row.portfolio_url as string,
    cover_note: row.cover_note as string,
    status: row.status as string,
    admin_note: (row.admin_note as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export class InquiriesService {
  async createContact(input: {
    name: string;
    email: string;
    company?: string | null;
    service: string;
    message: string;
  }) {
    const { data, error } = await supabase
      .from('contact_inquiries')
      .insert({
        name: input.name,
        email: input.email.toLowerCase(),
        company: input.company?.trim() ? input.company : null,
        service: input.service,
        message: input.message,
        status: 'new',
      })
      .select(CONTACT_COLS)
      .single();

    if (error) throw error;
    return serializeContact(data as Record<string, unknown>);
  }

  async listContactAdmin(page = 1, perPage = 20, status?: string) {
    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    let qb = supabase
      .from('contact_inquiries')
      .select(CONTACT_COLS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) qb = qb.eq('status', status);

    const { data, error, count } = await qb;
    if (error) throw error;

    return {
      inquiries: (data ?? []).map((row) => serializeContact(row as Record<string, unknown>)),
      meta: paginationMeta(count ?? 0, p, pp),
    };
  }

  async updateContactAdmin(id: string, patch: { status?: string; admin_note?: string | null }) {
    const { data: existing, error: findErr } = await supabase
      .from('contact_inquiries')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!existing) throw ApiError.notFound('Inquiry not found');

    const { data, error } = await supabase
      .from('contact_inquiries')
      .update(patch)
      .eq('id', id)
      .select(CONTACT_COLS)
      .single();

    if (error) throw error;
    return serializeContact(data as Record<string, unknown>);
  }

  async createCareer(input: {
    full_name: string;
    email: string;
    phone?: string | null;
    role: string;
    portfolio_url: string;
    cover_note: string;
  }) {
    const { data, error } = await supabase
      .from('career_applications')
      .insert({
        full_name: input.full_name,
        email: input.email.toLowerCase(),
        phone: input.phone?.trim() ? input.phone : null,
        role: input.role,
        portfolio_url: input.portfolio_url,
        cover_note: input.cover_note,
        status: 'new',
      })
      .select(CAREER_COLS)
      .single();

    if (error) throw error;
    return serializeCareer(data as Record<string, unknown>);
  }

  async listCareerAdmin(page = 1, perPage = 20, status?: string) {
    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    let qb = supabase
      .from('career_applications')
      .select(CAREER_COLS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) qb = qb.eq('status', status);

    const { data, error, count } = await qb;
    if (error) throw error;

    return {
      applications: (data ?? []).map((row) => serializeCareer(row as Record<string, unknown>)),
      meta: paginationMeta(count ?? 0, p, pp),
    };
  }

  async updateCareerAdmin(id: string, patch: { status?: string; admin_note?: string | null }) {
    const { data: existing, error: findErr } = await supabase
      .from('career_applications')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!existing) throw ApiError.notFound('Application not found');

    const { data, error } = await supabase
      .from('career_applications')
      .update(patch)
      .eq('id', id)
      .select(CAREER_COLS)
      .single();

    if (error) throw error;
    return serializeCareer(data as Record<string, unknown>);
  }
}

export const inquiriesService = new InquiriesService();
