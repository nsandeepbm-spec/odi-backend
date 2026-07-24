import { z } from 'zod';

export const productStatusSchema = z.enum(['draft', 'live', 'coming_soon', 'archived']);

export const kitItemSchema = z.object({
  name: z.string().min(1).max(120),
  qty: z.number().int().positive(),
  detail: z.string().max(300).optional().default(''),
});

export const productImageInputSchema = z.object({
  url: z.string().min(1).max(1000),
  alt: z.string().max(200).optional().nullable(),
  sort_order: z.number().int().min(0).optional().default(0),
  is_primary: z.boolean().optional().default(false),
});

export const createProductSchema = z
  .object({
    slug: z
      .string()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase-kebab-case'),
    name: z.string().min(1).max(160),
    volume: z.string().max(40).optional().nullable(),
    description: z.string().max(2000).optional().nullable(),
    long_description: z.string().max(10000).optional().nullable(),
    author: z.string().max(160).optional().nullable(),
    publisher: z.string().max(160).optional().nullable(),
    language: z.string().max(60).optional().nullable(),
    age_range: z.string().max(60).optional().nullable(),
    pages: z.number().int().positive().optional().nullable(),
    price_paise: z.number().int().min(0),
    compare_at_paise: z.number().int().min(0).optional().nullable(),
    stock_qty: z.number().int().min(0).optional().default(0),
    status: productStatusSchema.optional().default('draft'),
    tag: z.string().max(60).optional().nullable(),
    features: z.array(z.string().max(120)).optional().default([]),
    categories: z.array(z.string().max(60)).optional().default([]),
    kit_contents: z.array(kitItemSchema).optional().default([]),
    sort_order: z.number().int().optional().default(0),
    images: z.array(productImageInputSchema).optional().default([]),
  })
  .strict();

export const updateProductSchema = createProductSchema
  .partial()
  .omit({ slug: true })
  .extend({
    slug: z
      .string()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
  });

export const listProductsQuerySchema = z.object({
  status: productStatusSchema.optional(),
  category: z.string().max(60).optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(1).max(100).optional().default(20),
});
