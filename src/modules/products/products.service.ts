import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { clampPage, clampPerPage, paginationMeta } from '../../lib/pagination.js';
import type { ProductImageRow, ProductRow, ProductWithMeta } from './products.types.js';

type ImageInput = {
  url: string;
  alt?: string | null;
  sort_order?: number;
  is_primary?: boolean;
};

async function ratingMap(productIds: string[]): Promise<Map<string, { avg: number; count: number }>> {
  const map = new Map<string, { avg: number; count: number }>();
  if (productIds.length === 0) return map;

  const { data, error } = await supabase
    .from('product_reviews')
    .select('product_id, rating')
    .in('product_id', productIds);

  if (error) throw error;

  const buckets = new Map<string, number[]>();
  for (const row of data ?? []) {
    const list = buckets.get(row.product_id) ?? [];
    list.push(row.rating);
    buckets.set(row.product_id, list);
  }

  for (const [id, ratings] of buckets) {
    const sum = ratings.reduce((a, b) => a + b, 0);
    map.set(id, {
      avg: Math.round((sum / ratings.length) * 10) / 10,
      count: ratings.length,
    });
  }
  return map;
}

async function imagesByProduct(productIds: string[]): Promise<Map<string, ProductImageRow[]>> {
  const map = new Map<string, ProductImageRow[]>();
  if (productIds.length === 0) return map;

  const { data, error } = await supabase
    .from('product_images')
    .select('*')
    .in('product_id', productIds)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  for (const img of (data ?? []) as ProductImageRow[]) {
    const list = map.get(img.product_id) ?? [];
    list.push(img);
    map.set(img.product_id, list);
  }
  return map;
}

function attachMeta(
  products: ProductRow[],
  images: Map<string, ProductImageRow[]>,
  ratings: Map<string, { avg: number; count: number }>
): ProductWithMeta[] {
  return products.map((p) => {
    const r = ratings.get(p.id);
    return {
      ...p,
      images: images.get(p.id) ?? [],
      rating_avg: r?.avg ?? 0,
      rating_count: r?.count ?? 0,
    };
  });
}

export class ProductsService {
  async listPublic(query: {
    status?: string;
    category?: string;
    q?: string;
    page?: number;
    perPage?: number;
  }) {
    const page = clampPage(query.page);
    const perPage = clampPerPage(query.perPage);
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let qb = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .in('status', query.status ? [query.status] : ['live', 'coming_soon'])
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .range(from, to);

    if (query.category) {
      qb = qb.contains('categories', [query.category]);
    }
    if (query.q?.trim()) {
      const q = query.q.trim();
      qb = qb.or(`name.ilike.%${q}%,description.ilike.%${q}%,slug.ilike.%${q}%`);
    }

    const { data, error, count } = await qb;
    if (error) throw error;

    const products = (data ?? []) as ProductRow[];
    const ids = products.map((p) => p.id);
    const [images, ratings] = await Promise.all([imagesByProduct(ids), ratingMap(ids)]);

    return {
      products: attachMeta(products, images, ratings),
      meta: paginationMeta(count ?? 0, page, perPage),
    };
  }

  async listAdmin(query: { page?: number; perPage?: number; status?: string }) {
    const page = clampPage(query.page);
    const perPage = clampPerPage(query.perPage);
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let qb = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .order('sort_order', { ascending: true })
      .range(from, to);

    if (query.status) qb = qb.eq('status', query.status);

    const { data, error, count } = await qb;
    if (error) throw error;

    const products = (data ?? []) as ProductRow[];
    const ids = products.map((p) => p.id);
    const [images, ratings] = await Promise.all([imagesByProduct(ids), ratingMap(ids)]);

    return {
      products: attachMeta(products, images, ratings),
      meta: paginationMeta(count ?? 0, page, perPage),
    };
  }

  async getBySlug(slug: string, opts?: { includeDraft?: boolean }) {
    let qb = supabase.from('products').select('*').eq('slug', slug);
    if (!opts?.includeDraft) {
      qb = qb.in('status', ['live', 'coming_soon']);
    }
    const { data, error } = await qb.maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const product = data as ProductRow;
    const [images, ratings] = await Promise.all([
      imagesByProduct([product.id]),
      ratingMap([product.id]),
    ]);
    return attachMeta([product], images, ratings)[0];
  }

  async getById(id: string) {
    const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const product = data as ProductRow;
    const [images, ratings] = await Promise.all([
      imagesByProduct([product.id]),
      ratingMap([product.id]),
    ]);
    return attachMeta([product], images, ratings)[0];
  }

  async getByIds(ids: string[]) {
    if (ids.length === 0) return [] as ProductRow[];
    const { data, error } = await supabase.from('products').select('*').in('id', ids);
    if (error) throw error;
    return (data ?? []) as ProductRow[];
  }

  private async replaceImages(productId: string, images: ImageInput[]) {
    await supabase.from('product_images').delete().eq('product_id', productId);
    if (images.length === 0) return;

    let primarySet = false;
    const rows = images.map((img, i) => {
      const isPrimary = img.is_primary === true && !primarySet;
      if (isPrimary) primarySet = true;
      return {
        product_id: productId,
        url: img.url,
        alt: img.alt ?? null,
        sort_order: img.sort_order ?? i,
        is_primary: isPrimary || (!primarySet && i === 0 && images.every((x) => !x.is_primary)),
      };
    });

    // Ensure exactly one primary
    if (!rows.some((r) => r.is_primary) && rows[0]) {
      rows[0].is_primary = true;
    }

    const { error } = await supabase.from('product_images').insert(rows);
    if (error) throw error;
  }

  async create(input: Record<string, unknown>) {
    const { images, ...fields } = input as { images?: ImageInput[] } & Record<string, unknown>;
    const { data, error } = await supabase
      .from('products')
      .insert(fields)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') throw ApiError.badRequest('Product slug already exists');
      throw error;
    }

    if (images?.length) {
      await this.replaceImages(data.id, images);
    }

    return this.getById(data.id);
  }

  async update(id: string, input: Record<string, unknown>) {
    const existing = await this.getById(id);
    if (!existing) throw ApiError.notFound('Product not found');

    const { images, ...fields } = input as { images?: ImageInput[] } & Record<string, unknown>;

    if (Object.keys(fields).length > 0) {
      const { error } = await supabase.from('products').update(fields).eq('id', id);
      if (error) {
        if (error.code === '23505') throw ApiError.badRequest('Product slug already exists');
        throw error;
      }
    }

    if (images) {
      await this.replaceImages(id, images);
    }

    return this.getById(id);
  }
  async uploadImage(fileBuffer: Buffer, mimetype: string, originalName: string): Promise<string> {
    const ext = originalName.split('.').pop()?.toLowerCase() || 'png';
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${ext}`;
    const filePath = `images/${filename}`;

    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(filePath, fileBuffer, {
        contentType: mimetype,
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload image to Supabase Storage: ${error.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  }
}

export const productsService = new ProductsService();
