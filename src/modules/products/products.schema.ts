import { z } from 'zod';

export const productStatusSchema = z.enum(['draft', 'live', 'coming_soon', 'archived']);

export const kitItemSchema = z.object({
  name: z.string().min(1).max(120),
  qty: z.number().int().positive(),
  detail: z.string().max(300).optional().default(''),
});

export const productImageKindSchema = z.enum(['card', 'gallery']);

export const productImageInputSchema = z.object({
  url: z.string().min(1).max(1000),
  alt: z.string().max(200).optional().nullable(),
  sort_order: z.number().int().min(0).optional().default(0),
  kind: productImageKindSchema.optional(),
  /** Legacy — prefer kind: 'card' */
  is_primary: z.boolean().optional().default(false),
});

const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase-kebab-case');

function hasCardImage(
  images: Array<{ kind?: string; is_primary?: boolean }> | undefined
): boolean {
  if (!images?.length) return false;
  return images.some((i) => i.kind === 'card' || i.is_primary === true) || images.length > 0;
}

const productBodyBase = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(160),
  volume: z.string().max(40).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  long_description: z.string().max(10000).optional().nullable(),
  author: z.string().max(160).optional().nullable(),
  publisher: z.string().max(160).optional().nullable(),
  language: z.string().max(60).optional().nullable(),
  age_range: z.string().max(60).optional().nullable(),
  pages: z.number().int().positive().optional().nullable(),
  publisher_bio: z.string().max(2000).optional().nullable(),
  author_bio: z.string().max(2000).optional().nullable(),
  editorial_review: z.string().max(2000).optional().nullable(),
  editorial_review_author: z.string().max(200).optional().nullable(),
  editorial_review_rating: z.number().int().min(1).max(5).optional().nullable(),
  price_paise: z.number().int().min(0),
  compare_at_paise: z.number().int().min(0).optional().nullable(),
  stock_qty: z.number().int().min(0).optional().default(0),
  status: productStatusSchema.optional().default('draft'),
  tag: z.string().max(60).optional().nullable(),
  is_featured: z.boolean().optional().default(false),
  features: z.array(z.string().max(120)).optional().default([]),
  categories: z.array(z.string().max(60)).optional().default([]),
  kit_contents: z.array(kitItemSchema).optional().default([]),
  sort_order: z.number().int().optional().default(0),
  /** 1 card + up to 5 gallery (checkout shows up to 6 slots: hero + 5 thumbs, or 5 total in flat list — gallery max 5) */
  images: z.array(productImageInputSchema).max(6).optional().default([]),
});

export const createProductSchema = productBodyBase
  .strict()
  .refine(
    (v) => v.compare_at_paise == null || v.compare_at_paise >= v.price_paise,
    { message: 'compare_at_paise must be ≥ price_paise', path: ['compare_at_paise'] }
  )
  .refine(
    (v) => v.status !== 'live' || hasCardImage(v.images),
    { message: 'Live products require at least one card image', path: ['images'] }
  );

export const updateProductSchema = productBodyBase
  .partial()
  .omit({ slug: true })
  .extend({
    slug: slugSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
  })
  .refine(
    (v) =>
      v.price_paise == null ||
      v.compare_at_paise == null ||
      v.compare_at_paise >= v.price_paise,
    { message: 'compare_at_paise must be ≥ price_paise', path: ['compare_at_paise'] }
  )
  .refine(
    (v) => v.status !== 'live' || v.images === undefined || hasCardImage(v.images),
    { message: 'Live products require at least one card image', path: ['images'] }
  );

/** Public catalog query — never expose draft/archived via status filter */
export const listProductsQuerySchema = z.object({
  status: z.enum(['live', 'coming_soon']).optional(),
  category: z.string().max(60).optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(1).max(100).optional().default(20),
});

/** Admin catalog query — all statuses allowed */
export const listAdminProductsQuerySchema = z.object({
  status: productStatusSchema.optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(1).max(100).optional().default(50),
});
