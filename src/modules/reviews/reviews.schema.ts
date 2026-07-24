import { z } from 'zod';

export const createReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    title: z.string().max(120).optional().nullable(),
    body: z.string().min(3).max(2000),
  })
  .strict();

export const updateReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    title: z.string().max(120).optional().nullable(),
    body: z.string().min(3).max(2000).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
  });
