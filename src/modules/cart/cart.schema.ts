import { z } from 'zod';

export const cartItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10),
});

export const addCartItemSchema = cartItemSchema.strict();

export const updateCartItemSchema = z
  .object({
    quantity: z.number().int().min(1).max(10),
  })
  .strict();

export const replaceCartSchema = z
  .object({
    items: z.array(cartItemSchema).max(50),
  })
  .strict();
