import { z } from 'zod';

export const notifyMeBodySchema = z
  .object({
    slug: z.string().min(1).max(120),
  })
  .strict();
