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
};

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

  assertUsable(coupon: CouponRow, userId: string, subtotalPaise: number) {
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

    return this.countUserRedemptions(coupon.id, userId).then((count) => {
      if (count >= coupon.per_user_limit) {
        throw ApiError.badRequest('You have already used this coupon');
      }
    });
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

  async validateForUser(
    userId: string,
    code: string,
    items?: { productId: string; quantity: number }[]
  ) {
    const coupon = await this.findByCode(code);
    if (!coupon) throw ApiError.notFound('Coupon not found');

    let subtotalPaise = 0;

    if (items?.length) {
      const products = await productsService.getByIds(items.map((i) => i.productId));
      for (const item of items) {
        const product = products.find((p) => p.id === item.productId);
        if (!product || product.status !== 'live') {
          throw ApiError.badRequest('Invalid product in coupon preview');
        }
        subtotalPaise += product.price_paise * item.quantity;
      }
    } else {
      const cart = await cartService.getCart(userId);
      subtotalPaise = cart.subtotal_paise;
    }

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

    return {
      coupons: coupons ?? [],
      meta: paginationMeta(count ?? 0, p, pp),
    };
  }

  async createAdmin(input: Omit<CouponRow, 'id' | 'created_at' | 'updated_at' | 'used_count'>) {
    const { data, error } = await supabase
      .from('coupons')
      .insert({ ...input, code: input.code.trim().toUpperCase() })
      .select()
      .single();

    if (error) throw ApiError.badRequest(error.message);
    return data;
  }

  async updateAdmin(id: string, updates: Partial<CouponRow>) {
    const payload = { ...updates };
    if (payload.code) payload.code = payload.code.trim().toUpperCase();

    const { data, error } = await supabase
      .from('coupons')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw ApiError.badRequest(error.message);
    return data;
  }
}

export const couponsService = new CouponsService();
