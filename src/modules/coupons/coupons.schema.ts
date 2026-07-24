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
