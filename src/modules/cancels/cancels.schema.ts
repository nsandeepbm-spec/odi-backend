import { z } from 'zod';

export const createCancelSchema = z
  .object({
    reason: z.string().trim().max(1000).optional().default(''),
  })
  .strict();

export const reviewCancelSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    adminNote: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

export const reviewRefundSchema = z
  .object({
    decision: z.enum(['approved', 'rejected', 'completed']),
    adminNote: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();
