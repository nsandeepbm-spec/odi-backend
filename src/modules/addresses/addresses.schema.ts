import { z } from 'zod';

export const addressBodySchema = z
  .object({
    label: z.string().max(60).optional().nullable(),
    first_name: z.string().min(1).max(80),
    last_name: z.string().max(80).optional().default(''),
    phone: z.string().min(6).max(30),
    email: z.string().email().max(160).optional().nullable(),
    street: z.string().min(3).max(300),
    city: z.string().min(2).max(100),
    state: z.string().max(100).optional().nullable(),
    postal_code: z.string().min(3).max(20),
    country: z.string().max(2).optional().default('IN'),
    is_default: z.boolean().optional().default(false),
  })
  .strict();

export const updateAddressSchema = addressBodySchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
  });
