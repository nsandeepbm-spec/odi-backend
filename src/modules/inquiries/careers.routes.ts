import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { inquiriesService } from './inquiries.service.js';
import { createCareerApplicationSchema } from './inquiries.schema.js';

/** Mounted at /careers — public, no auth */
const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createCareerApplicationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid application', parsed.error.flatten().fieldErrors);
    }
    const application = await inquiriesService.createCareer(parsed.data);
    res.status(201).json({ success: true, data: { application } });
  })
);

export default router;
