import { z } from 'zod';

export const inquiryStatusSchema = z.enum(['new', 'in_review', 'closed']);

const optionalBlank = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null) return null;
      const t = v.trim();
      if (!t) return null;
      return t.slice(0, max);
    });

const portfolioUrl = z
  .string()
  .trim()
  .min(8, 'Enter a portfolio or LinkedIn URL')
  .max(500)
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    try {
      const u = new URL(v);
      return Boolean(u.hostname) && u.hostname.includes('.');
    } catch {
      return false;
    }
  }, { message: 'Use a full URL like https://linkedin.com/in/you' });

export const createContactInquirySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(160),
    company: optionalBlank(160),
    service: z.string().trim().min(2).max(80),
    message: z.string().trim().min(10).max(4000),
  })
  .strict();

export const createCareerApplicationSchema = z
  .object({
    full_name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(160),
    phone: optionalBlank(30),
    role: z.string().trim().min(2).max(80),
    portfolio_url: portfolioUrl,
    cover_note: z.string().trim().min(10).max(4000),
  })
  .strict();

export const updateInquiryAdminSchema = z
  .object({
    status: inquiryStatusSchema.optional(),
    admin_note: z.string().trim().max(2000).optional().nullable(),
  })
  .strict()
  .refine((v) => v.status !== undefined || v.admin_note !== undefined, {
    message: 'Provide status and/or admin_note',
  });
