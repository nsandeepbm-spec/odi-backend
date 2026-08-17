import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import { clampPage, clampPerPage, paginationMeta } from '../../lib/pagination.js';
import { bundleProductImages, normalizeImageInputs, type ImageInput } from '../../lib/productImages.js';
import type { ProductImageRow, ProductRow, ProductWithMeta } from './products.types.js';

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
    const productImages = images.get(p.id) ?? [];
    return {
      ...p,
      images: productImages,
      media: bundleProductImages(productImages),
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

  async listAdmin(query: { page?: number; perPage?: number; status?: string; q?: string }) {
    const page = clampPage(query.page);
    const perPage = clampPerPage(query.perPage);
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let qb = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (query.status) qb = qb.eq('status', query.status);
    if (query.q?.trim()) {
      const q = query.q.trim();
      qb = qb.or(`name.ilike.%${q}%,slug.ilike.%${q}%,description.ilike.%${q}%`);
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

    const rows = normalizeImageInputs(images).map((img) => ({
      product_id: productId,
      url: img.url,
      alt: img.alt,
      sort_order: img.sort_order,
      kind: img.kind,
      is_primary: img.is_primary,
    }));

    const { error } = await supabase.from('product_images').insert(rows);
    if (error) throw error;
  }

  private assertLivePackaging(
    product: {
      status?: string;
      weight_grams?: number | null;
      length_cm?: number | null;
      width_cm?: number | null;
      height_cm?: number | null;
    },
    status = product.status
  ) {
    if (status !== 'live') return;
    const { weight_grams, length_cm, width_cm, height_cm } = product;
    if (
      weight_grams == null ||
      length_cm == null ||
      width_cm == null ||
      height_cm == null ||
      weight_grams <= 0 ||
      Number(length_cm) <= 0 ||
      Number(width_cm) <= 0 ||
      Number(height_cm) <= 0
    ) {
      throw ApiError.badRequest(
        'Live products require parcel weight (grams) and dimensions (length × width × height in cm)'
      );
    }
  }

  async create(input: Record<string, unknown>) {
    const { images, ...fields } = input as { images?: ImageInput[] } & Record<string, unknown>;

    if (fields.status === 'live' && !(images && images.length > 0)) {
      throw ApiError.badRequest('Live products require at least one card image');
    }

    this.assertLivePackaging(fields);

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

    const product = await this.getById(data.id);
    if (!product) throw ApiError.internal('Product created but could not be reloaded');
    return product;
  }

  async update(id: string, input: Record<string, unknown>) {
    const existing = await this.getById(id);
    if (!existing) throw ApiError.notFound('Product not found');

    const { images, ...fields } = input as { images?: ImageInput[] } & Record<string, unknown>;

    const nextStatus = (fields.status as string | undefined) ?? existing.status;
    if (nextStatus === 'live') {
      const willHaveImages =
        images !== undefined ? images.length > 0 : (existing.media?.card != null || existing.images.length > 0);
      if (!willHaveImages) {
        throw ApiError.badRequest('Live products require at least one card image');
      }
      this.assertLivePackaging({ ...existing, ...fields }, nextStatus);
    }

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

    const product = await this.getById(id);
    if (!product) throw ApiError.notFound('Product not found');

    // Waitlist emails: only when status transitions *into* live (products.status is source of truth).
    if (existing.status !== 'live' && product.status === 'live') {
      try {
        const { notifyMeService } = await import('../notify-me/notify-me.service.js');
        await notifyMeService.onProductWentLive({
          id: product.id,
          slug: product.slug,
          name: product.name,
        });
      } catch (err) {
        console.error('[notify-me] failed to process waitlist after product went live', err);
      }
    }

    return product;
  }
  async uploadImage(fileBuffer: Buffer, mimetype: string, originalName: string): Promise<string> {
    const bucket = env.supabase.storageBucket;
    const ext = originalName.split('.').pop()?.toLowerCase() || 'png';
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${ext}`;
    const filePath = `images/${filename}`;

    const { error } = await supabase.storage.from(bucket).upload(filePath, fileBuffer, {
      contentType: mimetype,
      upsert: false,
    });

    if (error) {
      throw new Error(`Failed to upload image to Supabase Storage (${bucket}): ${error.message}`);
    }

    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  }
}

export const productsService = new ProductsService();
