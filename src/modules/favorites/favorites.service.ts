import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { productsService } from '../products/products.service.js';

export class FavoritesService {
  async list(userId: string) {
    const { data, error } = await supabase
      .from('user_favorites')
      .select(
        `
        id, product_id, created_at,
        products ( id, slug, name, price_paise, status, tag )
      `
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const productIds = (data ?? []).map((row: { product_id: string }) => row.product_id);
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

    const favorites = (data ?? []).map((row: Record<string, unknown>) => {
      const product = row.products as {
        id: string;
        slug: string;
        name: string;
        price_paise: number;
        status: string;
        tag: string | null;
      } | null;
      return {
        id: row.id as string,
        product_id: row.product_id as string,
        slug: product?.slug ?? null,
        name: product?.name ?? null,
        price_paise: product?.price_paise ?? null,
        status: product?.status ?? null,
        tag: product?.tag ?? null,
        image_url: imageByProduct.get(row.product_id as string) ?? null,
        created_at: row.created_at as string,
      };
    });

    return favorites;
  }

  async add(userId: string, slug: string) {
    const product = await productsService.getBySlug(slug);
    if (!product) throw ApiError.notFound('Product not found');

    const { data, error } = await supabase
      .from('user_favorites')
      .insert({ user_id: userId, product_id: product.id })
      .select('id, product_id, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return { id: '', product_id: product.id, slug: product.slug, created_at: new Date().toISOString(), alreadySaved: true };
      }
      throw error;
    }

    return { ...data, slug: product.slug, alreadySaved: false };
  }

  async remove(userId: string, slug: string) {
    const product = await productsService.getBySlug(slug);
    if (!product) throw ApiError.notFound('Product not found');

    const { error } = await supabase
      .from('user_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', product.id);

    if (error) throw error;
  }
}

export const favoritesService = new FavoritesService();
