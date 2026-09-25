import { supabase } from '../../config/supabase.js';
import { ordersService } from '../orders/orders.service.js';

const REVENUE_STATUSES = new Set(['paid', 'processing', 'shipped', 'delivered']);

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  total_paise: number;
  shipping_address: Record<string, unknown> | null;
  user_id: string | null;
  created_at: string;
  razorpay_order_id?: string | null;
  payment_close_reason?: string | null;
  channel?: string | null;
};

type ProductSnap = {
  id: string;
  slug: string;
  name: string;
  volume: string | null;
  status: string;
  stock_qty: number;
  price_paise: number;
  sort_order: number;
};

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short' });
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(key: string) {
  const [y, m, day] = key.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleString('en-IN', { day: 'numeric', month: 'short' });
}

function weekKey(iso: string) {
  const d = new Date(iso);
  return weekKeyFromDate(d);
}

function weekKeyFromDate(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - start.getDay());
  return dayKeyFromDate(start);
}

function weekLabel(key: string) {
  const [y, m, day] = key.split('-').map(Number);
  return `W ${new Date(y, m - 1, day).toLocaleString('en-IN', { day: 'numeric', month: 'short' })}`;
}

export class AdminOverviewService {
  async getOverview() {
    await ordersService.expireAbandonedOnlinePending().catch((err) => {
      console.error('[admin/overview] expire abandoned', err);
    });

    const [{ data: orders, error: ordersErr }, { data: products, error: productsErr }, customers] =
      await Promise.all([
        // Include ONLINE + BULK_OFFLINE so offline/bulk revenue counts in KPIs.
        supabase
          .from('orders')
          .select(
            'id, order_number, status, total_paise, shipping_address, user_id, created_at, razorpay_order_id, payment_close_reason, channel'
          )
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('products')
          .select('id, slug, name, volume, status, stock_qty, price_paise, sort_order')
          .order('sort_order', { ascending: true })
          .limit(50),
        this.countCustomers(),
      ]);

    if (ordersErr) throw ordersErr;
    if (productsErr) throw productsErr;

    const orderRows = (orders ?? []) as OrderRow[];
    const productRows = (products ?? []) as ProductSnap[];

    const paidLike = orderRows.filter((o) => REVENUE_STATUSES.has(o.status));
    const revenuePaise = paidLike.reduce((sum, o) => sum + (o.total_paise ?? 0), 0);

    // Real work queue: skip unpaid Razorpay attempts and abandoned payment rows.
    const attentionCount = orderRows.filter((o) => {
      if (o.payment_close_reason === 'payment_abandoned') return false;
      if (o.status === 'pending' && o.razorpay_order_id) return false;
      // Bulk pending (awaiting offline collection) counts as attention work.
      return o.status === 'pending' || o.status === 'processing' || o.status === 'paid';
    }).length;

    const visibleRecent = orderRows.filter(
      (o) =>
        o.payment_close_reason !== 'payment_abandoned' &&
        !(o.status === 'pending' && o.razorpay_order_id)
    );

    const userIds = [
      ...new Set(
        visibleRecent
          .slice(0, 8)
          .map((o) => o.user_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const userMap = await this.userMap(userIds);

    const recentOrders = visibleRecent.slice(0, 8).map((o) => {
      const ship = o.shipping_address ?? {};
      const org = typeof ship.organization_name === 'string' ? ship.organization_name.trim() : '';
      const first = typeof ship.first_name === 'string' ? ship.first_name : '';
      const last = typeof ship.last_name === 'string' ? ship.last_name : '';
      const shipEmail = typeof ship.email === 'string' ? ship.email : null;
      const user = o.user_id ? userMap.get(o.user_id) : undefined;
      const personName = [first, last].filter(Boolean).join(' ');
      return {
        id: o.id,
        orderNumber: o.order_number,
        status: o.status,
        totalPaise: o.total_paise,
        createdAt: o.created_at,
        channel: o.channel ?? 'ONLINE',
        customerName:
          org || personName || user?.full_name || (o.channel === 'BULK_OFFLINE' ? 'Bulk buyer' : 'Customer'),
        customerEmail: shipEmail || user?.email || null,
      };
    });

    const imageMap = await this.primaryImages(productRows.map((p) => p.id));
    const catalog = productRows.slice(0, 6).map((p) => {
      const imgs = imageMap.get(p.id) ?? [];
      const card = imgs.find((i) => i.kind === 'card') ?? imgs.find((i) => i.is_primary) ?? imgs[0];
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        volume: p.volume,
        status: p.status,
        stockQty: p.stock_qty,
        pricePaise: p.price_paise,
        imageUrl: card?.url ?? null,
      };
    });

    const revenuePack = this.buildAllRevenueSeries(paidLike);

    return {
      kpis: {
        revenuePaise,
        orderCount: orderRows.filter((o) => o.payment_close_reason !== 'payment_abandoned').length,
        paidOrderCount: paidLike.length,
        attentionCount,
        customerCount: customers.active,
        totalCustomerCount: customers.total,
        liveProductCount: productRows.filter((p) => p.status === 'live').length,
        productCount: productRows.length,
      },
      revenueGranularity: revenuePack.defaultGranularity,
      revenueSeries: revenuePack.series[revenuePack.defaultGranularity],
      revenueSeriesBy: revenuePack.series,
      catalog,
      recentOrders,
    };
  }

  private async countCustomers(): Promise<{ active: number; total: number }> {
    const [activeRes, totalRes] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('users').select('id', { count: 'exact', head: true }),
    ]);
    if (activeRes.error) throw activeRes.error;
    if (totalRes.error) throw totalRes.error;
    return { active: activeRes.count ?? 0, total: totalRes.count ?? 0 };
  }

  private async userMap(ids: string[]) {
    const map = new Map<string, { email: string; full_name: string | null }>();
    if (!ids.length) return map;
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name')
      .in('id', ids);
    if (error) throw error;
    for (const u of data ?? []) {
      map.set(u.id, { email: u.email, full_name: u.full_name });
    }
    return map;
  }

  private async primaryImages(productIds: string[]) {
    const map = new Map<string, Array<{ url: string; kind?: string; is_primary?: boolean }>>();
    if (!productIds.length) return map;
    const { data, error } = await supabase
      .from('product_images')
      .select('product_id, url, kind, is_primary, sort_order')
      .in('product_id', productIds)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    for (const img of data ?? []) {
      const list = map.get(img.product_id) ?? [];
      list.push(img);
      map.set(img.product_id, list);
    }
    return map;
  }

  /**
   * Always build day / week / month series so the admin UI can switch views.
   * Default picks day when volume is sparse (avoids empty months).
   */
  private buildAllRevenueSeries(orders: OrderRow[]): {
    defaultGranularity: 'day' | 'week' | 'month';
    series: {
      day: { month: string; revenuePaise: number }[];
      week: { month: string; revenuePaise: number }[];
      month: { month: string; revenuePaise: number }[];
    };
  } {
    const now = new Date();
    const dayBuckets = new Map<string, number>();
    const weekBuckets = new Map<string, number>();
    const monthBuckets = new Map<string, number>();

    for (const o of orders) {
      const dKey = dayKey(o.created_at);
      const wKey = weekKey(o.created_at);
      const mKey = monthKey(o.created_at);
      dayBuckets.set(dKey, (dayBuckets.get(dKey) ?? 0) + o.total_paise);
      weekBuckets.set(wKey, (weekBuckets.get(wKey) ?? 0) + o.total_paise);
      monthBuckets.set(mKey, (monthBuckets.get(mKey) ?? 0) + o.total_paise);
    }

    const day: { month: string; revenuePaise: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = dayKeyFromDate(d);
      day.push({ month: dayLabel(key), revenuePaise: dayBuckets.get(key) ?? 0 });
    }

    const week: { month: string; revenuePaise: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
      const key = weekKeyFromDate(d);
      week.push({ month: weekLabel(key), revenuePaise: weekBuckets.get(key) ?? 0 });
    }

    const month: { month: string; revenuePaise: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      month.push({ month: monthLabel(key), revenuePaise: monthBuckets.get(key) ?? 0 });
    }

    let defaultGranularity: 'day' | 'week' | 'month' = 'month';
    if (orders.length > 0) {
      const oldestMs = Math.min(...orders.map((o) => new Date(o.created_at).getTime()));
      const spanDays = Math.max(1, (now.getTime() - oldestMs) / 86_400_000);
      if (orders.length <= 12 || spanDays <= 28) defaultGranularity = 'day';
      else if (spanDays <= 90) defaultGranularity = 'week';
    }

    return { defaultGranularity, series: { day, week, month } };
  }
}

export const adminOverviewService = new AdminOverviewService();
