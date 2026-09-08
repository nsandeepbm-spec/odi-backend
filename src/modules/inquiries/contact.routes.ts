import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { inquiriesService } from './inquiries.service.js';
import { createContactInquirySchema } from './inquiries.schema.js';

/** Mounted at /contact — public, no auth */
const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createContactInquirySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid inquiry', parsed.error.flatten().fieldErrors);
    }
    const inquiry = await inquiriesService.createContact(parsed.data);
    res.status(201).json({ success: true, data: { inquiry } });
  })
);

export default router;
