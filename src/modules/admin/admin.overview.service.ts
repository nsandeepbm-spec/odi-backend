import { supabase } from '../../config/supabase.js';

const REVENUE_STATUSES = new Set(['paid', 'processing', 'shipped', 'delivered']);

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  total_paise: number;
  shipping_address: Record<string, unknown> | null;
  user_id: string;
  created_at: string;
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

export class AdminOverviewService {
  async getOverview() {
    const [{ data: orders, error: ordersErr }, { data: products, error: productsErr }, customers] =
      await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, status, total_paise, shipping_address, user_id, created_at')
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
    const attentionCount = orderRows.filter(
      (o) => o.status === 'pending' || o.status === 'processing' || o.status === 'paid'
    ).length;

    const userIds = [...new Set(orderRows.slice(0, 8).map((o) => o.user_id))];
    const userMap = await this.userMap(userIds);

    const recentOrders = orderRows.slice(0, 8).map((o) => {
      const ship = o.shipping_address ?? {};
      const first = typeof ship.first_name === 'string' ? ship.first_name : '';
      const last = typeof ship.last_name === 'string' ? ship.last_name : '';
      const shipEmail = typeof ship.email === 'string' ? ship.email : null;
      const user = userMap.get(o.user_id);
      return {
        id: o.id,
        orderNumber: o.order_number,
        status: o.status,
        totalPaise: o.total_paise,
        createdAt: o.created_at,
        customerName: [first, last].filter(Boolean).join(' ') || user?.full_name || 'Customer',
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

    const revenueSeries = this.buildRevenueSeries(paidLike);

    return {
      kpis: {
        revenuePaise,
        orderCount: orderRows.length,
        paidOrderCount: paidLike.length,
        attentionCount,
        customerCount: customers,
        liveProductCount: productRows.filter((p) => p.status === 'live').length,
        productCount: productRows.length,
      },
      revenueSeries,
      catalog,
      recentOrders,
    };
  }

  private async countCustomers() {
    const { count, error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    if (error) throw error;
    return count ?? 0;
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

  private buildRevenueSeries(orders: OrderRow[]) {
    const buckets = new Map<string, number>();
    for (const o of orders) {
      const key = monthKey(o.created_at);
      buckets.set(key, (buckets.get(key) ?? 0) + o.total_paise);
    }

    // Last 7 calendar months (including empty)
    const now = new Date();
    const series: { month: string; revenuePaise: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      series.push({
        month: monthLabel(key),
        revenuePaise: buckets.get(key) ?? 0,
      });
    }
    return series;
  }
}

export const adminOverviewService = new AdminOverviewService();
