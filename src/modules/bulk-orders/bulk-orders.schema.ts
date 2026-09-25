import { z } from 'zod';

export const BULK_PAYMENT_METHODS = [
  'UPI',
  'Cash',
  'Online Payment',
  'Bank Transfer',
  'Cheque',
  'Other',
] as const;

export const bulkCustomerSchema = z
  .object({
    organization_name: z.string().trim().min(1).max(200),
    contact_name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(200).optional().nullable(),
    phone: z.string().trim().min(7).max(20),
    gstin: z.string().trim().max(20).optional().nullable(),
    street: z.string().trim().max(300).optional().nullable(),
    city: z.string().trim().max(100).optional().nullable(),
    state: z.string().trim().max(100).optional().nullable(),
    postal_code: z.string().trim().max(12).optional().nullable(),
    country: z.string().trim().max(80).optional().nullable(),
  })
  .strict();

export const createBulkOrderSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(100_000),
    /** Custom unit selling price in paise */
    unitPricePaise: z.number().int().min(0),
    discountPaise: z.number().int().min(0).optional().default(0),
    taxPaise: z.number().int().min(0).optional().default(0),
    paymentMethod: z.enum(BULK_PAYMENT_METHODS),
    paymentStatus: z.enum(['paid', 'pending']),
    customer: bulkCustomerSchema,
    notes: z.string().trim().max(2000).optional().nullable(),
    idempotencyKey: z.string().trim().min(8).max(120).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const subtotal = v.unitPricePaise * v.quantity;
    if ((v.discountPaise ?? 0) > subtotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Discount cannot exceed subtotal',
        path: ['discountPaise'],
      });
    }
  });

export const listBulkOrdersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    perPage: z.coerce.number().int().min(1).max(100).optional(),
    paymentStatus: z.enum(['paid', 'pending', 'all']).optional(),
    q: z.string().trim().max(120).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

export const markBulkOrderPaidSchema = z
  .object({
    paymentMethod: z.enum(BULK_PAYMENT_METHODS).optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
    /** ISO timestamp when money was collected; defaults to now */
    paidAt: z.string().trim().min(10).max(40).optional(),
  })
  .strict();

export type CreateBulkOrderInput = z.infer<typeof createBulkOrderSchema>;
export type MarkBulkOrderPaidInput = z.infer<typeof markBulkOrderPaidSchema>;
