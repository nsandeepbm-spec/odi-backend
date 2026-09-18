import { z } from 'zod';

export const validateCouponSchema = z
  .object({
    code: z.string().min(2).max(40),
    /** Optional line items for preview; otherwise uses cart */
    items: z
      .array(
        z.object({
          productId: z.string().uuid(),
          quantity: z.number().int().min(1).max(10),
        })
      )
      .optional(),
  })
  .strict();

export const listOffersQuerySchema = z
  .object({
    productId: z.string().uuid().optional(),
    slug: z.string().min(1).max(120).optional(),
    quantity: z.coerce.number().int().min(1).max(10).optional().default(1),
  })
  .strict()
  .refine((v) => Boolean(v.productId || v.slug), {
    message: 'Provide productId or slug',
  });

const couponBaseObject = z.object({
  code: z.string().min(2).max(40).regex(/^[A-Z0-9_-]+$/i, 'Code must be alphanumeric'),
  type: z.enum(['percent', 'fixed_paise']),
  value: z.number().int().positive(),
  min_subtotal_paise: z.number().int().min(0).optional().default(0),
  max_discount_paise: z.number().int().positive().optional().nullable(),
  max_uses: z.number().int().positive().optional().nullable(),
  per_user_limit: z.number().int().positive().optional().default(1),
  starts_at: z.string().datetime({ offset: true }).optional().nullable(),
  ends_at: z.string().datetime({ offset: true }).optional().nullable(),
  active: z.boolean().optional().default(true),
  is_public: z.boolean().optional().default(false),
  title: z.string().max(120).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  /** Empty / omitted = store-wide. Otherwise only these product UUIDs. */
  productIds: z.array(z.string().uuid()).max(50).optional().default([]),
}).strict();

export const createCouponAdminSchema = couponBaseObject.refine(
  (v) => v.type !== 'percent' || v.value <= 100,
  { message: 'Percent coupon value must be ≤ 100', path: ['value'] }
);

export const updateCouponAdminSchema = couponBaseObject
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
  })
  .refine((v) => v.type !== 'percent' || v.value == null || v.value <= 100, {
    message: 'Percent coupon value must be ≤ 100',
    path: ['value'],
  });
