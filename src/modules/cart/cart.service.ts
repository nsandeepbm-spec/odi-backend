import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { productsService } from '../products/products.service.js';

export class CartService {
  async getCart(userId: string) {
    const { data, error } = await supabase
      .from('cart_items')
      .select(
        `
        id, quantity, product_id, created_at, updated_at,
        products (
          id, slug, name, price_paise, compare_at_paise, stock_qty, status, tag
        )
      `
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const productIds = (data ?? []).map((r: { product_id: string }) => r.product_id);
    const { data: images } = await supabase
      .from('product_images')
      .select('product_id, url, is_primary, sort_order')
      .in('product_id', productIds.length ? productIds : ['00000000-0000-0000-0000-000000000000'])
      .order('sort_order', { ascending: true });

    const primaryByProduct = new Map<string, string>();
    for (const img of images ?? []) {
      if (!primaryByProduct.has(img.product_id) || img.is_primary) {
        primaryByProduct.set(img.product_id, img.url);
      }
    }

    const items = (data ?? []).map((row: Record<string, unknown>) => {
      const product = row.products as {
        id: string;
        slug: string;
        name: string;
        price_paise: number;
        compare_at_paise: number | null;
        stock_qty: number;
        status: string;
        tag: string | null;
      } | null;
      return {
        id: row.id as string,
        product_id: row.product_id as string,
        quantity: row.quantity as number,
        product: product
          ? {
              ...product,
              image_url: primaryByProduct.get(row.product_id as string) ?? null,
            }
          : null,
      };
    });

    const subtotal_paise = items.reduce((sum, item) => {
      const price = item.product?.price_paise ?? 0;
      return sum + price * item.quantity;
    }, 0);

    return { items, subtotal_paise, currency: 'INR' };
  }

  async addItem(userId: string, productId: string, quantity: number) {
    const product = await productsService.getById(productId);
    if (!product || product.status !== 'live') {
      throw ApiError.badRequest('Product is not available');
    }
    if (product.stock_qty < quantity) {
      throw ApiError.badRequest('Insufficient stock');
    }

    const { data: existing } = await supabase
      .from('cart_items')
      .select('*')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .maybeSingle();

    if (existing) {
      const nextQty = Math.min(10, existing.quantity + quantity);
      if (product.stock_qty < nextQty) throw ApiError.badRequest('Insufficient stock');
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: nextQty })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('cart_items').insert({
        user_id: userId,
        product_id: productId,
        quantity,
      });
      if (error) throw error;
    }

    return this.getCart(userId);
  }

  async updateItem(userId: string, productId: string, quantity: number) {
    const product = await productsService.getById(productId);
    if (!product || product.status !== 'live') {
      throw ApiError.badRequest('Product is not available');
    }
    if (product.stock_qty < quantity) {
      throw ApiError.badRequest('Insufficient stock');
    }

    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity })
      .eq('user_id', userId)
      .eq('product_id', productId)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw ApiError.notFound('Cart item not found');

    return this.getCart(userId);
  }

  async removeItem(userId: string, productId: string) {
    const { data, error } = await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw ApiError.notFound('Cart item not found');

    return this.getCart(userId);
  }

  async replace(userId: string, items: { productId: string; quantity: number }[]) {
    await supabase.from('cart_items').delete().eq('user_id', userId);

    if (items.length === 0) return this.getCart(userId);

    const productIds = items.map((i) => i.productId);
    const products = await productsService.getByIds(productIds);
    if (products.length !== new Set(productIds).size) {
      throw ApiError.badRequest('One or more products are invalid');
    }

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId)!;
      if (product.status !== 'live') {
        throw ApiError.badRequest(`${product.name} is not available`);
      }
      if (product.stock_qty < item.quantity) {
        throw ApiError.badRequest(`Insufficient stock for ${product.name}`);
      }
    }

    const { error } = await supabase.from('cart_items').insert(
      items.map((i) => ({
        user_id: userId,
        product_id: i.productId,
        quantity: i.quantity,
      }))
    );
    if (error) throw error;

    return this.getCart(userId);
  }

  async clear(userId: string) {
    const { error } = await supabase.from('cart_items').delete().eq('user_id', userId);
    if (error) throw error;
    return this.getCart(userId);
  }
}

export const cartService = new CartService();
