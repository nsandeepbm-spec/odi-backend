import { z } from 'zod';

export const favoriteBodySchema = z
  .object({
    slug: z.string().min(1).max(120),
  })
  .strict();
