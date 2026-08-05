import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  /** History page: include cleared. Bell/preview: false (default). */
  includeCleared: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const previewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional().default(4),
});
