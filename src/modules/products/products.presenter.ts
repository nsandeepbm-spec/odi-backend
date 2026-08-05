import type { ProductWithMeta } from './products.types.js';
import { bundleProductImages } from '../../lib/productImages.js';

export type KitContentDto = {
  name: string;
  qty: number;
  detail: string;
};

function normalizeKitContents(raw: unknown): KitContentDto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      const qty = Number(row.qty);
      if (!name || !Number.isFinite(qty) || qty < 1) return null;
      return {
        name,
        qty: Math.floor(qty),
        detail: typeof row.detail === 'string' ? row.detail : '',
      };
    })
    .filter((x): x is KitContentDto => x !== null);
}

/**
 * Stable product DTO for admin + public APIs.
 * Matches storefront needs: card hero, gallery strip, kit, money in paise.
 */
export function serializeProduct(product: ProductWithMeta) {
  const media = product.media ?? bundleProductImages(product.images ?? []);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    volume: product.volume,
    description: product.description,
    long_description: product.long_description,
    author: product.author,
    publisher: product.publisher,
    publisher_bio: product.publisher_bio ?? null,
    author_bio: product.author_bio ?? null,
    editorial_review: product.editorial_review ?? null,
    editorial_review_author: product.editorial_review_author ?? null,
    editorial_review_rating: product.editorial_review_rating ?? null,
    language: product.language,
    age_range: product.age_range,
    pages: product.pages,
    price_paise: product.price_paise,
    compare_at_paise: product.compare_at_paise,
    stock_qty: product.stock_qty,
    status: product.status,
    tag: product.tag,
    is_featured: Boolean(product.is_featured),
    features: Array.isArray(product.features) ? product.features : [],
    categories: Array.isArray(product.categories) ? product.categories : [],
    kit_contents: normalizeKitContents(product.kit_contents),
    sort_order: product.sort_order,
    /** Prefer this for UI: hero + gallery */
    media: {
      card: media.card,
      gallery: media.gallery,
      all: media.all,
    },
    /** Flat image rows (admin editor / legacy) */
    images: (product.images ?? []).map((img) => ({
      id: img.id,
      product_id: img.product_id,
      url: img.url,
      alt: img.alt,
      sort_order: img.sort_order,
      is_primary: img.is_primary,
      kind: img.kind ?? (img.is_primary ? 'card' : 'gallery'),
      created_at: img.created_at,
    })),
    rating_avg: product.rating_avg ?? 0,
    rating_count: product.rating_count ?? 0,
    rating: {
      avg: product.rating_avg ?? 0,
      count: product.rating_count ?? 0,
    },
    /** Convenience for catalog cards / checkout availability */
    available: product.status === 'live' && product.stock_qty > 0,
    created_at: product.created_at,
    updated_at: product.updated_at,
  };
}

export function serializeProductList(
  products: ProductWithMeta[],
  meta: { total: number; page: number; perPage: number; totalPages: number }
) {
  return {
    products: products.map(serializeProduct),
    meta,
  };
}

export type SerializedProduct = ReturnType<typeof serializeProduct>;
