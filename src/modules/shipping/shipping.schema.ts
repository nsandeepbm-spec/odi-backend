import { z } from 'zod';

export const pincodeParamSchema = z.object({
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Pincode must be exactly 6 digits'),
});
