import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { computeDiscountPaise } from '../../lib/money.js';
import { productsService } from '../products/products.service.js';
import { cartService } from '../cart/cart.service.js';

export type CouponRow = {
  id: string;
  code: string;
  type: 'percent' | 'fixed_paise';
  value: number;
  min_subtotal_paise: number;
  max_discount_paise: number | null;
  max_uses: number | null;
  per_user_limit: number;
  used_count: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  is_public: boolean;
  title: string | null;
  description: string | null;
};

export type AdminCouponInput = {
  code: string;
  type: 'percent' | 'fixed_paise';
  value: number;
  min_subtotal_paise?: number;
  max_discount_paise?: number | null;
  max_uses?: number | null;
  per_user_limit?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  active?: boolean;
  is_public?: boolean;
  title?: string | null;
  description?: string | null;
  productIds?: string[];
};

async function productIdsForCoupon(couponId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('coupon_products')
    .select('product_id')
    .eq('coupon_id', couponId);
  if (error) throw error;
  return (data ?? []).map((r) => r.product_id as string);
}

async function replaceCouponProducts(couponId: string, productIds: string[]) {
  const { error: delErr } = await supabase.from('coupon_products').delete().eq('coupon_id', couponId);
  if (delErr) throw delErr;
  if (!productIds.length) return;
  const { error: insErr } = await supabase.from('coupon_products').insert(
    productIds.map((product_id) => ({ coupon_id: couponId, product_id }))
  );
  if (insErr) throw ApiError.badRequest(insErr.message);
}

export class CouponsService {
  async findByCode(code: string): Promise<CouponRow | null> {
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .ilike('code', code.trim())
      .maybeSingle();

    if (error) throw error;
    return data as CouponRow | null;
  }

  async getScopedProductIds(couponId: string): Promise<string[]> {
    return productIdsForCoupon(couponId);
  }

  /**
   * Empty scope = store-wide. Non-empty = every cart product must be in the allow-list.
   */
  async assertProductScope(couponId: string, cartProductIds: string[]) {
    const scoped = await productIdsForCoupon(couponId);
    if (!scoped.length) return;
    if (!cartProductIds.length) {
      throw ApiError.badRequest('This coupon requires a product in the cart');
    }
    const allowed = new Set(scoped);
    const invalid = cartProductIds.filter((id) => !allowed.has(id));
    if (invalid.length) {
      throw ApiError.badRequest('This coupon is not valid for the selected product(s)');
    }
  }

  async assertUsable(coupon: CouponRow, userId: string | null, subtotalPaise: number) {
    if (!coupon.active) throw ApiError.badRequest('Coupon is inactive');

    const now = Date.now();
    if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) {
      throw ApiError.badRequest('Coupon is not active yet');
    }
    if (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) {
      throw ApiError.badRequest('Coupon has expired');
    }
    if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) {
      throw ApiError.badRequest('Coupon usage limit reached');
    }
    if (subtotalPaise < coupon.min_subtotal_paise) {
      throw ApiError.badRequest(
        `Minimum order of ₹${(coupon.min_subtotal_paise / 100).toFixed(0)} required`
      );
    }

    // Guests can preview apply; per-user limit is checked once they sign in / at checkout.
    if (!userId) return;

    const count = await this.countUserRedemptions(coupon.id, userId);
    if (count >= coupon.per_user_limit) {
      throw ApiError.badRequest('You have already used this coupon');
    }
  }

  async countUserRedemptions(couponId: string, userId: string) {
    const { count, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', couponId)
      .eq('user_id', userId)
      .in('status', ['paid', 'processing', 'shipped', 'delivered']);

    if (error) throw error;
    return count ?? 0;
  }

  private async resolveLineProducts(
    userId: string | null,
    items?: { productId: string; quantity: number }[]
  ): Promise<{ productIds: string[]; subtotalPaise: number }> {
    if (items?.length) {
      const products = await productsService.getByIds(items.map((i) => i.productId));
      let subtotalPaise = 0;
      const productIds: string[] = [];
      for (const item of items) {
        const product = products.find((p) => p.id === item.productId);
        if (!product || product.status !== 'live') {
          throw ApiError.badRequest('Invalid product in coupon preview');
        }
        productIds.push(product.id);
        subtotalPaise += product.price_paise * item.quantity;
      }
      return { productIds, subtotalPaise };
    }

    if (!userId) {
      throw ApiError.badRequest('Provide items to preview a coupon');
    }

    const cart = await cartService.getCart(userId);
    return {
      productIds: cart.items.map((i) => i.product_id as string).filter(Boolean),
      subtotalPaise: cart.subtotal_paise,
    };
  }

  /**
   * Preview discount for a code. Guests OK when `items` are sent (no cart).
   * Checkout session still re-validates with a signed-in user before charging.
   */
  async validateForUser(
    userId: string | null,
    code: string,
    items?: { productId: string; quantity: number }[]
  ) {
    const coupon = await this.findByCode(code);
    if (!coupon) throw ApiError.notFound('Coupon not found');

    const { productIds, subtotalPaise } = await this.resolveLineProducts(userId, items);
    await this.assertProductScope(coupon.id, productIds);
    await this.assertUsable(coupon, userId, subtotalPaise);
    const discount_paise = computeDiscountPaise(coupon, subtotalPaise);

    return {
      valid: true,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      subtotal_paise: subtotalPaise,
      discount_paise,
      total_paise: subtotalPaise - discount_paise,
      currency: 'INR',
    };
  }

  /**
   * Public checkout offers for a product. Soft eligibility — never trusts client for discount.
   * `userId` optional: guests see offers; signed-in users get per-user “already used” checks.
   */
  async listPublicOffers(
    userId: string | null,
    opts: { productId?: string; slug?: string; quantity: number }
  ) {
    let productId = opts.productId ?? null;
    if (!productId && opts.slug) {
      const product = await productsService.getBySlug(opts.slug);
      if (!product || product.status !== 'live') {
        throw ApiError.notFound('Product not found');
      }
      productId = product.id;
    }
    if (!productId) throw ApiError.badRequest('Provide productId or slug');

    const products = await productsService.getByIds([productId]);
    const product = products[0];
    if (!product || product.status !== 'live') {
      throw ApiError.notFound('Product not found');
    }

    const quantity = opts.quantity;
    const subtotalPaise = product.price_paise * quantity;

    const { data: publicCoupons, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('is_public', true)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const coupons = (publicCoupons ?? []) as CouponRow[];
    if (!coupons.length) return { offers: [], subtotal_paise: subtotalPaise, currency: 'INR' };

    const couponIds = coupons.map((c) => c.id);
    const { data: links, error: linkErr } = await supabase
      .from('coupon_products')
      .select('coupon_id, product_id')
      .in('coupon_id', couponIds);
    if (linkErr) throw linkErr;

    const scopeMap = new Map<string, string[]>();
    for (const row of links ?? []) {
      const list = scopeMap.get(row.coupon_id as string) ?? [];
      list.push(row.product_id as string);
      scopeMap.set(row.coupon_id as string, list);
    }

    const now = Date.now();
    const offers = [];

    const usedByCoupon = new Map<string, number>();
    if (userId) {
      // One query for all redemption counts (avoid N+1)
      const { data: redemptionRows, error: redErr } = await supabase
        .from('orders')
        .select('coupon_id')
        .eq('user_id', userId)
        .in('coupon_id', couponIds)
        .in('status', ['paid', 'processing', 'shipped', 'delivered']);
      if (redErr) throw redErr;

      for (const row of redemptionRows ?? []) {
        const cid = row.coupon_id as string;
        usedByCoupon.set(cid, (usedByCoupon.get(cid) ?? 0) + 1);
      }
    }

    for (const coupon of coupons) {
      const scoped = scopeMap.get(coupon.id) ?? [];
      // Store-wide or includes this product
      if (scoped.length && !scoped.includes(productId)) continue;

      let eligible = true;
      let reason: string | null = null;
      let discount_preview_paise = 0;

      if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) {
        eligible = false;
        reason = 'Offer not active yet';
      } else if (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) {
        eligible = false;
        reason = 'Offer expired';
      } else if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) {
        eligible = false;
        reason = 'Offer fully redeemed';
      } else if (subtotalPaise < coupon.min_subtotal_paise) {
        eligible = false;
        const need = coupon.min_subtotal_paise - subtotalPaise;
        reason = `Shop for ₹${(need / 100).toFixed(0)} more to apply`;
      } else if (userId) {
        const used = usedByCoupon.get(coupon.id) ?? 0;
        if (used >= coupon.per_user_limit) {
          eligible = false;
          reason = 'You have already used this offer';
        } else {
          discount_preview_paise = computeDiscountPaise(coupon, subtotalPaise);
        }
      } else {
        discount_preview_paise = computeDiscountPaise(coupon, subtotalPaise);
      }

      offers.push({
        id: coupon.id,
        code: coupon.code,
        title: coupon.title || coupon.code,
        description: coupon.description,
        type: coupon.type,
        value: coupon.value,
        min_subtotal_paise: coupon.min_subtotal_paise,
        max_discount_paise: coupon.max_discount_paise,
        ends_at: coupon.ends_at,
        eligible,
        reason,
        discount_preview_paise,
      });
    }

    offers.sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return b.discount_preview_paise - a.discount_preview_paise;
    });

    return { offers, subtotal_paise: subtotalPaise, currency: 'INR' };
  }

  async listAdmin(page = 1, perPage = 50) {
    const { clampPage, clampPerPage, paginationMeta } = await import('../../lib/pagination.js');
    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    const { data: coupons, error, count } = await supabase
      .from('coupons')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const rows = coupons ?? [];
    const ids = rows.map((c) => c.id as string);
    const productIdsByCoupon = new Map<string, string[]>();
    if (ids.length) {
      const { data: links, error: linkErr } = await supabase
        .from('coupon_products')
        .select('coupon_id, product_id')
        .in('coupon_id', ids);
      if (linkErr) throw linkErr;
      for (const row of links ?? []) {
        const list = productIdsByCoupon.get(row.coupon_id as string) ?? [];
        list.push(row.product_id as string);
        productIdsByCoupon.set(row.coupon_id as string, list);
      }
    }

    return {
      coupons: rows.map((c) => ({
        ...c,
        product_ids: productIdsByCoupon.get(c.id as string) ?? [],
      })),
      meta: paginationMeta(count ?? 0, p, pp),
    };
  }

  async createAdmin(input: AdminCouponInput) {
    const { productIds = [], ...rest } = input;
    if (productIds.length) {
      const products = await productsService.getByIds(productIds);
      if (products.length !== productIds.length) {
        throw ApiError.badRequest('One or more products are invalid');
      }
    }

    const { data, error } = await supabase
      .from('coupons')
      .insert({
        ...rest,
        code: rest.code.trim().toUpperCase(),
        title: rest.title?.trim() || null,
        description: rest.description?.trim() || null,
        is_public: rest.is_public ?? false,
      })
      .select()
      .single();

    if (error) throw ApiError.badRequest(error.message);
    await replaceCouponProducts(data.id, productIds);
    return { ...data, product_ids: productIds };
  }

  async updateAdmin(id: string, updates: Partial<AdminCouponInput>) {
    const { productIds, ...rest } = updates;
    const payload: Record<string, unknown> = { ...rest };
    if (typeof payload.code === 'string') {
      payload.code = payload.code.trim().toUpperCase();
    }
    if ('title' in payload && typeof payload.title === 'string') {
      payload.title = payload.title.trim() || null;
    }
    if ('description' in payload && typeof payload.description === 'string') {
      payload.description = payload.description.trim() || null;
    }

    if (productIds?.length) {
      const products = await productsService.getByIds(productIds);
      if (products.length !== productIds.length) {
        throw ApiError.badRequest('One or more products are invalid');
      }
    }

    let data;
    if (Object.keys(payload).length) {
      const { data: updated, error } = await supabase
        .from('coupons')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw ApiError.badRequest(error.message);
      data = updated;
    } else {
      const { data: existing, error } = await supabase.from('coupons').select('*').eq('id', id).single();
      if (error || !existing) throw ApiError.notFound('Coupon not found');
      data = existing;
    }

    if (productIds !== undefined) {
      await replaceCouponProducts(id, productIds);
    }

    const scoped = productIds !== undefined ? productIds : await productIdsForCoupon(id);
    return { ...data, product_ids: scoped };
  }
}

export const couponsService = new CouponsService();
