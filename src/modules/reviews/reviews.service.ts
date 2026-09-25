import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { clampPage, clampPerPage, paginationMeta } from '../../lib/pagination.js';
import { productsService } from '../products/products.service.js';

export class ReviewsService {
  async listBySlug(slug: string, page = 1, perPage = 20) {
    const product = await productsService.getBySlug(slug);
    if (!product) throw ApiError.notFound('Product not found');

    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    const { data, error, count } = await supabase
      .from('product_reviews')
      .select(
        'id, product_id, user_id, rating, title, body, created_at, updated_at, users(full_name, avatar_url)',
        { count: 'exact' }
      )
      .eq('product_id', product.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const reviews = (data ?? []).map((row: Record<string, unknown>) => {
      const user = row.users as { full_name: string | null; avatar_url: string | null } | null;
      const { users: _u, ...rest } = row;
      return {
        ...rest,
        author_name: user?.full_name ?? 'Customer',
        author_avatar_url: user?.avatar_url ?? null,
      };
    });

    return {
      reviews,
      meta: paginationMeta(count ?? 0, p, pp),
    };
  }

  async create(slug: string, userId: string, input: { rating: number; title?: string | null; body: string }) {
    const product = await productsService.getBySlug(slug);
    if (!product) throw ApiError.notFound('Product not found');
    if (product.status !== 'live') {
      throw ApiError.badRequest('Reviews are only allowed for live products');
    }

    await this.assertDeliveredPurchase(userId, product.id);

    const { data, error } = await supabase
      .from('product_reviews')
      .insert({
        product_id: product.id,
        user_id: userId,
        rating: input.rating,
        title: input.title ?? null,
        body: input.body,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') throw ApiError.badRequest('You already reviewed this product');
      throw error;
    }
    return data;
  }

  /** Reviews only after a delivered order that included this product. */
  private async assertDeliveredPurchase(userId: string, productId: string) {
    const { data, error } = await supabase
      .from('order_items')
      .select('id, orders!inner(id, user_id, status)')
      .eq('product_id', productId)
      .eq('orders.user_id', userId)
      .eq('orders.status', 'delivered')
      .limit(1);

    if (error) throw error;
    if (!data?.length) {
      throw ApiError.badRequest('You can review this kit after your order is delivered');
    }
  }

  async update(reviewId: string, userId: string, patch: Record<string, unknown>, isAdmin = false) {
    const { data: existing, error: findErr } = await supabase
      .from('product_reviews')
      .select('*')
      .eq('id', reviewId)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!existing) throw ApiError.notFound('Review not found');
    if (!isAdmin && existing.user_id !== userId) {
      throw ApiError.forbidden('You can only edit your own review');
    }

    const { data, error } = await supabase
      .from('product_reviews')
      .update(patch)
      .eq('id', reviewId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  async listForUser(userId: string) {
    const { data, error } = await supabase
      .from('product_reviews')
      .select(
        `
        id, product_id, user_id, rating, title, body, created_at, updated_at,
        products ( slug, name )
      `
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row: Record<string, unknown>) => {
      const product = row.products as { slug: string; name: string } | null;
      const { products: _p, ...rest } = row;
      return {
        ...rest,
        product_slug: product?.slug ?? null,
        product_name: product?.name ?? null,
      };
    });
  }

  async listAdmin(page = 1, perPage = 20, productSlug?: string) {
    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    let productId: string | null = null;
    if (productSlug?.trim()) {
      const product = await productsService.getBySlug(productSlug.trim());
      if (!product) throw ApiError.notFound('Product not found');
      productId = product.id;
    }

    let query = supabase
      .from('product_reviews')
      .select(
        `
        id, product_id, user_id, rating, title, body, created_at, updated_at,
        products ( slug, name ),
        users ( full_name, email, avatar_url )
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (productId) query = query.eq('product_id', productId);

    const { data, error, count } = await query;
    if (error) throw error;

    const reviews = (data ?? []).map((row: Record<string, unknown>) => {
      const product = row.products as { slug: string; name: string } | null;
      const user = row.users as {
        full_name: string | null;
        email: string | null;
        avatar_url: string | null;
      } | null;
      const { products: _p, users: _u, ...rest } = row;
      return {
        ...rest,
        product_slug: product?.slug ?? null,
        product_name: product?.name ?? null,
        author_name: user?.full_name ?? 'Customer',
        author_email: user?.email ?? null,
        author_avatar_url: user?.avatar_url ?? null,
      };
    });

    return {
      reviews,
      meta: paginationMeta(count ?? 0, p, pp),
    };
  }

  /** Admin-only delete. Customers cannot remove published reviews. */
  async remove(reviewId: string, isAdmin: boolean) {
    if (!isAdmin) throw ApiError.forbidden('Only admins can delete reviews');

    const { data: existing, error: findErr } = await supabase
      .from('product_reviews')
      .select('id')
      .eq('id', reviewId)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!existing) throw ApiError.notFound('Review not found');

    const { error } = await supabase.from('product_reviews').delete().eq('id', reviewId);
    if (error) throw error;
  }
}

export const reviewsService = new ReviewsService();
