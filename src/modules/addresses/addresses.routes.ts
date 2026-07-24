import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { param } from '../../lib/params.js';
import { addressesService } from './addresses.service.js';
import { addressBodySchema, updateAddressSchema } from './addresses.schema.js';

/** Mounted under /user with authenticate + loadUser already applied */
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const addresses = await addressesService.list(req.user!.id);
    res.json({ success: true, data: { addresses } });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = addressBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid address', parsed.error.flatten().fieldErrors);
    }
    const address = await addressesService.create(req.user!.id, parsed.data);
    res.status(201).json({ success: true, data: { address } });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const parsed = updateAddressSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid address update', parsed.error.flatten().fieldErrors);
    }
    const address = await addressesService.update(req.user!.id, param(req.params.id), parsed.data);
    res.json({ success: true, data: { address } });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await addressesService.remove(req.user!.id, param(req.params.id));
    res.json({ success: true, data: { deleted: true } });
  })
);

export default router;
