import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { supportService } from './support.service.js';
import { createSupportTicketSchema } from './support.schema.js';

/** Mounted under /user with authenticate + loadUser */
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = typeof req.query.page === 'string' ? Number(req.query.page) : 1;
    const perPage = typeof req.query.perPage === 'string' ? Number(req.query.perPage) : 20;
    const result = await supportService.listForUser(req.user!.id, page, perPage);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSupportTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid ticket', parsed.error.flatten().fieldErrors);
    }
    const ticket = await supportService.create(req.user!.id, parsed.data);
    res.status(201).json({ success: true, data: { ticket } });
  })
);

export default router;
