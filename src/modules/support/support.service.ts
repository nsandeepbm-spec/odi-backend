import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { clampPage, clampPerPage, paginationMeta } from '../../lib/pagination.js';

function serialize(row: Record<string, unknown>, user?: { email?: string; full_name?: string | null } | null) {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    subject: row.subject as string,
    message: row.message as string,
    status: row.status as string,
    admin_note: (row.admin_note as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    user_email: user?.email ?? null,
    user_name: user?.full_name ?? null,
  };
}

export class SupportService {
  async create(userId: string, input: { subject: string; message: string }) {
    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        user_id: userId,
        subject: input.subject,
        message: input.message,
        status: 'open',
      })
      .select('id, user_id, subject, message, status, admin_note, created_at, updated_at')
      .single();

    if (error) throw error;
    return serialize(data as Record<string, unknown>);
  }

  async listForUser(userId: string, page = 1, perPage = 20) {
    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    const { data, error, count } = await supabase
      .from('support_tickets')
      .select('id, user_id, subject, message, status, admin_note, created_at, updated_at', {
        count: 'exact',
      })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return {
      tickets: (data ?? []).map((row) => serialize(row as Record<string, unknown>)),
      meta: paginationMeta(count ?? 0, p, pp),
    };
  }

  async listAdmin(page = 1, perPage = 20, status?: string) {
    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    let qb = supabase
      .from('support_tickets')
      .select('id, user_id, subject, message, status, admin_note, created_at, updated_at', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) qb = qb.eq('status', status);

    const { data, error, count } = await qb;
    if (error) throw error;

    const userIds = [...new Set((data ?? []).map((t) => t.user_id as string))];
    const { data: users } = await supabase
      .from('users')
      .select('id, email, full_name')
      .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);

    const byId = new Map((users ?? []).map((u) => [u.id, u]));

    return {
      tickets: (data ?? []).map((row) =>
        serialize(row as Record<string, unknown>, byId.get(row.user_id as string) ?? null)
      ),
      meta: paginationMeta(count ?? 0, p, pp),
    };
  }

  async updateAdmin(
    id: string,
    patch: { status?: string; admin_note?: string | null }
  ) {
    const { data: existing, error: findErr } = await supabase
      .from('support_tickets')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!existing) throw ApiError.notFound('Ticket not found');

    const { data, error } = await supabase
      .from('support_tickets')
      .update(patch)
      .eq('id', id)
      .select('id, user_id, subject, message, status, admin_note, created_at, updated_at')
      .single();

    if (error) throw error;
    return serialize(data as Record<string, unknown>);
  }
}

export const supportService = new SupportService();
