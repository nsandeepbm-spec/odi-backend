import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { clampPage, clampPerPage, paginationMeta } from '../../lib/pagination.js';

export type NotificationType =
  | 'order_created'
  | 'order_paid'
  | 'order_processing'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled'
  | 'order_refunded'
  | 'product_live'
  | 'admin_product_live'
  | 'admin_order_created'
  | 'admin_order_paid'
  | 'admin_support_ticket'
  | 'support_replied';

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType | string;
  title: string;
  body?: string | null;
  link?: string | null;
  metadata?: Record<string, unknown>;
};

function serialize(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    type: row.type as string,
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    link: (row.link as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    read_at: (row.read_at as string | null) ?? null,
    cleared_at: (row.cleared_at as string | null) ?? null,
    created_at: row.created_at as string,
    is_read: row.read_at != null,
    is_cleared: row.cleared_at != null,
  };
}

const SELECT_COLS = 'id, type, title, body, link, metadata, read_at, cleared_at, created_at';

export class NotificationsService {
  async create(input: CreateNotificationInput) {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        metadata: input.metadata ?? {},
      })
      .select(SELECT_COLS)
      .single();

    if (error) throw error;
    return serialize(data as Record<string, unknown>);
  }

  async createMany(inputs: CreateNotificationInput[]) {
    if (inputs.length === 0) return [];

    const rows = inputs.map((input) => ({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      metadata: input.metadata ?? {},
    }));

    const { data, error } = await supabase.from('notifications').insert(rows).select(SELECT_COLS);

    if (error) throw error;
    return (data ?? []).map((row) => serialize(row as Record<string, unknown>));
  }

  async list(
    userId: string,
    query: {
      unreadOnly?: boolean;
      includeCleared?: boolean;
      page?: number;
      perPage?: number;
    }
  ) {
    const page = clampPage(query.page);
    const perPage = clampPerPage(query.perPage, 20, 50);
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let qb = supabase
      .from('notifications')
      .select(SELECT_COLS, { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (!query.includeCleared) qb = qb.is('cleared_at', null);
    if (query.unreadOnly) qb = qb.is('read_at', null);

    const { data, error, count } = await qb;
    if (error) throw error;

    return {
      notifications: (data ?? []).map((row) => serialize(row as Record<string, unknown>)),
      meta: paginationMeta(count ?? 0, page, perPage),
    };
  }

  /** Latest N uncleared — for the bell dropdown. */
  async preview(userId: string, limit = 4) {
    const { data, error } = await supabase
      .from('notifications')
      .select(SELECT_COLS)
      .eq('user_id', userId)
      .is('cleared_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []).map((row) => serialize(row as Record<string, unknown>));
  }

  /** Unread + not cleared — badge count. */
  async unreadCount(userId: string) {
    const { data, error } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .is('read_at', null)
      .is('cleared_at', null);

    if (error) throw error;
    return data?.length ?? 0;
  }

  async markRead(userId: string, id: string) {
    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select(SELECT_COLS)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw ApiError.notFound('Notification not found');
    return serialize(data as Record<string, unknown>);
  }

  async markAllRead(userId: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null)
      .is('cleared_at', null);

    if (error) throw error;
    return { updated: true };
  }

  /** Hide from bell; keep in history (`cleared_at`). Also marks read. */
  async clearBell(userId: string) {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('notifications')
      .update({ cleared_at: now, read_at: now })
      .eq('user_id', userId)
      .is('cleared_at', null);

    if (error) throw error;
    return { cleared: true };
  }

  async safeCreate(input: CreateNotificationInput) {
    try {
      return await this.create(input);
    } catch (err) {
      console.error('[notifications] create failed', err);
      return null;
    }
  }

  async safeCreateMany(inputs: CreateNotificationInput[]) {
    try {
      return await this.createMany(inputs);
    } catch (err) {
      console.error('[notifications] createMany failed', err);
      return [];
    }
  }

  async notifyAdmins(input: Omit<CreateNotificationInput, 'userId'>, opts?: { excludeUserId?: string }) {
    try {
      const { data: admins, error } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'admin')
        .eq('status', 'active');

      if (error) throw error;
      const inputs = (admins ?? [])
        .filter((a) => a.id !== opts?.excludeUserId)
        .map((a) => ({ ...input, userId: a.id }));
      return await this.safeCreateMany(inputs);
    } catch (err) {
      console.error('[notifications] notifyAdmins failed', err);
      return [];
    }
  }
}

export const notificationsService = new NotificationsService();
