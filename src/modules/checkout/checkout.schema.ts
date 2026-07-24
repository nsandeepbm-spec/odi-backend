import { z } from 'zod';

export const shippingAddressSchema = z
  .object({
    first_name: z.string().min(1).max(80),
    last_name: z.string().max(80).optional().default(''),
    phone: z.string().min(6).max(30),
    email: z.string().email().max(160).optional().nullable(),
    street: z.string().min(3).max(300),
    city: z.string().min(2).max(100),
    state: z.string().max(100).optional().nullable(),
    postal_code: z.string().min(3).max(20),
    country: z.string().max(2).optional().default('IN'),
  })
  .strict();

export const checkoutSessionSchema = z
  .object({
    /** Use saved address by id XOR inline shippingAddress */
    addressId: z.string().uuid().optional(),
    shippingAddress: shippingAddressSchema.optional(),
    /** Explicit items XOR useCart:true. Prefer productId; slug allowed for storefront. */
    items: z
      .array(
        z
          .object({
            productId: z.string().uuid().optional(),
            slug: z
              .string()
              .min(2)
              .max(120)
              .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
              .optional(),
            quantity: z.number().int().min(1).max(10),
          })
          .refine((v) => Boolean(v.productId) || Boolean(v.slug), {
            message: 'Provide productId or slug',
          })
      )
      .min(1)
      .optional(),
    useCart: z.boolean().optional().default(false),
    couponCode: z.string().min(2).max(40).optional().nullable(),
  })
  .strict()
  .refine((v) => Boolean(v.addressId) || Boolean(v.shippingAddress), {
    message: 'Provide addressId or shippingAddress',
  })
  .refine((v) => v.useCart || (v.items && v.items.length > 0), {
    message: 'Provide items or set useCart: true',
  });
