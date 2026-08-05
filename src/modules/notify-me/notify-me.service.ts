import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { productsService } from '../products/products.service.js';

type ProductJoin = {
  id: string;
  slug: string;
  name: string;
  status: string;
  tag: string | null;
  price_paise: number;
};

function serializeRow(
  row: {
    id: string;
    product_id: string;
    notified_at: string | null;
    created_at: string;
    products: ProductJoin | ProductJoin[] | null;
  },
  imageUrl: string | null
) {
  const product = Array.isArray(row.products) ? row.products[0] ?? null : row.products;
  const status = product?.status ?? null;
  return {
    id: row.id,
    product_id: row.product_id,
    slug: product?.slug ?? null,
    name: product?.name ?? null,
    price_paise: product?.price_paise ?? null,
    status,
    is_live: status === 'live',
    tag: product?.tag ?? null,
    image_url: imageUrl,
    notified_at: row.notified_at,
    created_at: row.created_at,
  };
}

export class NotifyMeService {
  private async cardImagesByProduct(productIds: string[]) {
    const { data: images } = await supabase
      .from('product_images')
      .select('product_id, url, is_primary, sort_order, kind')
      .in('product_id', productIds.length ? productIds : ['00000000-0000-0000-0000-000000000000'])
      .order('sort_order', { ascending: true });

    const imageByProduct = new Map<string, string>();
    for (const img of images ?? []) {
      if (img.kind === 'card') {
        imageByProduct.set(img.product_id, img.url);
      } else if (!imageByProduct.has(img.product_id) || img.is_primary) {
        imageByProduct.set(img.product_id, img.url);
      }
    }
    return imageByProduct;
  }

  async list(userId: string) {
    const { data, error } = await supabase
      .from('product_notify_requests')
      .select(
        `
        id, product_id, notified_at, created_at,
        products ( id, slug, name, price_paise, status, tag )
      `
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = data ?? [];
    const productIds = rows.map((row: { product_id: string }) => row.product_id);
    const imageByProduct = await this.cardImagesByProduct(productIds);

    return rows.map((row: (typeof rows)[number]) =>
      serializeRow(row as Parameters<typeof serializeRow>[0], imageByProduct.get(row.product_id) ?? null)
    );
  }

  async subscribe(userId: string, slug: string) {
    const product = await productsService.getBySlug(slug);
    if (!product) throw ApiError.notFound('Product not found');

    if (product.status === 'live') {
      throw ApiError.badRequest('Product is already live — no need to notify');
    }
    if (product.status !== 'coming_soon') {
      throw ApiError.badRequest('Notify Me is only available for coming-soon products');
    }

    const { data, error } = await supabase
      .from('product_notify_requests')
      .insert({ user_id: userId, product_id: product.id })
      .select('id, product_id, notified_at, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          id: '',
          product_id: product.id,
          slug: product.slug,
          status: product.status,
          is_live: false,
          notified_at: null,
          created_at: new Date().toISOString(),
          alreadySubscribed: true,
        };
      }
      throw error;
    }

    return {
      ...data,
      slug: product.slug,
      status: product.status,
      is_live: false,
      alreadySubscribed: false,
    };
  }

  async unsubscribe(userId: string, slug: string) {
    const product = await productsService.getBySlug(slug);
    if (!product) throw ApiError.notFound('Product not found');

    const { error } = await supabase
      .from('product_notify_requests')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', product.id);

    if (error) throw error;
  }

  /**
   * Called when `products.status` flips to `live`.
   * Creates in-app notifications + launch emails for waitlisted users, then sets notified_at.
   */
  async onProductWentLive(product: { id: string; slug: string; name: string }) {
    const { data, error } = await supabase
      .from('product_notify_requests')
      .select(
        `
        id,
        user_id,
        users ( id, email, full_name )
      `
      )
      .eq('product_id', product.id)
      .is('notified_at', null);

    if (error) throw error;

    const pending = (data ?? []).map((row: Record<string, unknown>) => {
      const user = row.users as { id: string; email: string; full_name: string | null } | null;
      return {
        requestId: row.id as string,
        userId: row.user_id as string,
        email: user?.email ?? null,
        fullName: user?.full_name ?? null,
      };
    });

    if (pending.length === 0) {
      const { notificationsService } = await import('../notifications/notifications.service.js');
      await notificationsService.notifyAdmins({
        type: 'admin_product_live',
        title: `${product.name} is live`,
        body: 'No waitlist subscribers to notify.',
        link: `/dashboard/admin/products/${product.id}`,
        metadata: { product_id: product.id, slug: product.slug, waitlist_count: 0 },
      });
      return { notified: 0, pending: 0 };
    }

    const { notificationsService } = await import('../notifications/notifications.service.js');
    await notificationsService.safeCreateMany(
      pending.map((p) => ({
        userId: p.userId,
        type: 'product_live',
        title: `${product.name} is live`,
        body: 'The kit you asked about is available to buy now.',
        link: `/checkout?product=${product.slug}`,
        metadata: {
          product_id: product.id,
          slug: product.slug,
          notify_request_id: p.requestId,
        },
      }))
    );

    // Confirm to admins (their own inbox) that waitlist was notified
    await notificationsService.notifyAdmins({
      type: 'admin_product_live',
      title: `${product.name} is live`,
      body:
        pending.length === 1
          ? '1 waitlist subscriber was notified.'
          : `${pending.length} waitlist subscribers were notified.`,
      link: `/dashboard/admin/products/${product.id}`,
      metadata: {
        product_id: product.id,
        slug: product.slug,
        waitlist_count: pending.length,
      },
    });

    const { sendProductLiveEmail } = await import('../../lib/mailer/index.js');
    for (const p of pending) {
      if (!p.email) continue;
      sendProductLiveEmail({
        to: p.email,
        name: p.fullName,
        productName: product.name,
        productSlug: product.slug,
      });
    }

    const { error: markErr } = await supabase
      .from('product_notify_requests')
      .update({ notified_at: new Date().toISOString() })
      .in(
        'id',
        pending.map((p) => p.requestId)
      );

    if (markErr) throw markErr;

    console.info(
      `[notify-me] product ${product.slug} went live — ${pending.length} in-app notification(s) + launch emails queued`
    );

    return { notified: pending.length, pending: pending.length };
  }
}

export const notifyMeService = new NotifyMeService();
