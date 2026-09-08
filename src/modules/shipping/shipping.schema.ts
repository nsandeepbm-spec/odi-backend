import { z } from 'zod';

export const pincodeParamSchema = z.object({
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Pincode must be exactly 6 digits'),
});

export const expectedTatQuerySchema = z.object({
  mot: z.enum(['E', 'S', 'e', 's', 'express', 'surface']).optional(),
});

export const shippingChargesQuerySchema = z.object({
  slug: z.string().trim().min(1, 'Product slug is required'),
  quantity: z.coerce.number().int().positive().max(99).default(1),
  mot: z.enum(['E', 'S', 'e', 's', 'express', 'surface']).optional(),
});
