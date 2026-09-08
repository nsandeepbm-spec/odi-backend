import { z } from 'zod';

export const legalSlugSchema = z.enum(['terms', 'privacy', 'cookies']);

const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('p'), text: z.string().trim().min(1).max(8000) }).strict(),
  z.object({ type: z.literal('h3'), text: z.string().trim().min(1).max(200) }).strict(),
  z
    .object({
      type: z.literal('ul'),
      items: z.array(z.string().trim().min(1).max(500)).min(1).max(40),
    })
    .strict(),
  z.object({ type: z.literal('contact') }).strict(),
]);

const sectionSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase kebab-case id'),
    title: z.string().trim().min(1).max(160),
    blocks: z.array(blockSchema).min(1).max(40),
  })
  .strict();

export const updateLegalPageSchema = z
  .object({
    eyebrow: z.string().trim().max(40),
    title: z.string().trim().min(1).max(80),
    titleAccent: z.string().trim().max(80),
    intro: z.string().trim().min(1).max(2000),
    effectiveDate: z.string().trim().min(4).max(40),
    lastUpdated: z.string().trim().min(4).max(40),
    sections: z.array(sectionSchema).min(1).max(50),
  })
  .strict()
  .refine(
    (v) => new Set(v.sections.map((s) => s.id)).size === v.sections.length,
    { message: 'Section ids must be unique', path: ['sections'] }
  );

export const updateLegalCompanySchema = z
  .object({
    brand: z.string().trim().min(1).max(80),
    entity: z.string().trim().min(1).max(160),
    address: z.string().trim().min(8).max(400),
    gstin: z.string().trim().min(8).max(30),
    email: z.string().trim().email().max(160),
    phone: z.string().trim().min(8).max(40),
    websiteHref: z.string().trim().url().max(200),
    websiteLabel: z.string().trim().min(3).max(80),
  })
  .strict();
