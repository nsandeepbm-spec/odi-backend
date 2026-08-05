import { z } from 'zod';

export const createSupportTicketSchema = z
  .object({
    subject: z.string().trim().min(3).max(160),
    message: z.string().trim().min(10).max(4000),
  })
  .strict();

export const updateSupportTicketAdminSchema = z
  .object({
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
    admin_note: z.string().trim().max(2000).optional().nullable(),
  })
  .strict()
  .refine((v) => v.status !== undefined || v.admin_note !== undefined, {
    message: 'Provide status and/or admin_note',
  });
