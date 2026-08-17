import { Router } from 'express';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { isDelhiveryConfigured, getDelhiveryEnvironment } from '../../lib/delhivery/config.js';
import { checkPincodeServiceability } from '../../lib/delhivery/pincode.js';
import { pincodeParamSchema } from './shipping.schema.js';

const router = Router();

/**
 * GET /shipping/pincode/:pincode
 * Public — Delhivery pin-code serviceability (required before order creation).
 */
router.get(
  '/pincode/:pincode',
  asyncHandler(async (req, res) => {
    if (!isDelhiveryConfigured()) {
      throw ApiError.internal('Shipping service is not configured');
    }

    const parsed = pincodeParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid pincode', parsed.error.flatten().fieldErrors);
    }

    const result = await checkPincodeServiceability(parsed.data.pincode);

    res.json({
      success: true,
      data: {
        ...result,
        provider: 'delhivery',
        environment: getDelhiveryEnvironment(),
        baseUrl: env.delhivery.baseUrl,
      },
    });
  })
);

export default router;
