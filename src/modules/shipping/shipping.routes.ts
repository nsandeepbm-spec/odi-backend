import { Router } from 'express';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { isDelhiveryConfigured, getDelhiveryEnvironment, delhiveryConfigHint } from '../../lib/delhivery/config.js';
import { checkPincodeServiceability } from '../../lib/delhivery/pincode.js';
import {
  expectedTatConfigHint,
  getExpectedTat,
  isExpectedTatConfigured,
} from '../../lib/delhivery/expected-tat.js';
import { expectedTatQuerySchema, pincodeParamSchema, shippingChargesQuerySchema } from './shipping.schema.js';
import { shippingService } from './shipping.service.js';

const router = Router();

function assertDelhiveryConfigured() {
  if (!isDelhiveryConfigured()) {
    throw ApiError.internal(`Shipping service is not configured. ${delhiveryConfigHint()}`);
  }
}

/**
 * GET /shipping/pincode/:pincode
 * Public — Delhivery pin-code serviceability (required before order creation).
 */
router.get(
  '/pincode/:pincode',
  asyncHandler(async (req, res) => {
    assertDelhiveryConfigured();

    const parsed = pincodeParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid pincode', parsed.error.flatten().fieldErrors);
    }

    const result = await checkPincodeServiceability(parsed.data.pincode);

    res.json({
      success: true,
      data: {
        pincode: result.pincode,
        serviceable: result.serviceable,
        prepaid: result.prepaid,
        cod: result.cod,
        delhivery: result.delhivery,
        requestUrl: result.requestUrl,
        provider: 'delhivery',
        environment: getDelhiveryEnvironment(),
        baseUrl: env.delhivery.baseUrl,
      },
    });
  })
);

/**
 * GET /shipping/tat/:destinationPin
 * Public — Delhivery expected TAT from warehouse origin to customer destination.
 * Query: mot=E|S (optional; defaults to DELHIVERY_MOT, usually S = Surface).
 */
router.get(
  '/tat/:destinationPin',
  asyncHandler(async (req, res) => {
    assertDelhiveryConfigured();

    if (!isExpectedTatConfigured()) {
      throw ApiError.internal(`Expected TAT is not configured. ${expectedTatConfigHint()}`);
    }

    const parsedParams = pincodeParamSchema.safeParse({ pincode: req.params.destinationPin });
    if (!parsedParams.success) {
      throw ApiError.badRequest('Invalid destination pincode', parsedParams.error.flatten().fieldErrors);
    }

    const parsedQuery = expectedTatQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw ApiError.badRequest('Invalid query', parsedQuery.error.flatten().fieldErrors);
    }

    const result = await getExpectedTat(parsedParams.data.pincode, {
      mot: parsedQuery.data.mot,
    });

    res.json({
      success: true,
      data: {
        originPin: result.originPin,
        destinationPin: result.destinationPin,
        mot: result.mot,
        pdt: result.pdt,
        days: result.days,
        label: result.label,
        delhivery: result.delhivery,
        requestUrl: result.requestUrl,
        provider: 'delhivery',
        environment: getDelhiveryEnvironment(),
        baseUrl: env.delhivery.baseUrl,
      },
    });
  })
);

/**
 * GET /shipping/charges/:destinationPin?slug=&quantity=
 * Public — Delhivery estimated shipping charge (origin warehouse → customer PIN).
 * Weight is read from the product in DB — never from the client.
 */
router.get(
  '/charges/:destinationPin',
  asyncHandler(async (req, res) => {
    assertDelhiveryConfigured();

    if (!isExpectedTatConfigured()) {
      throw ApiError.internal(`Expected TAT is not configured. ${expectedTatConfigHint()}`);
    }

    const parsedParams = pincodeParamSchema.safeParse({ pincode: req.params.destinationPin });
    if (!parsedParams.success) {
      throw ApiError.badRequest('Invalid destination pincode', parsedParams.error.flatten().fieldErrors);
    }

    const parsedQuery = shippingChargesQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw ApiError.badRequest('Invalid query', parsedQuery.error.flatten().fieldErrors);
    }

    const result = await shippingService.quoteBySlug({
      destinationPin: parsedParams.data.pincode,
      slug: parsedQuery.data.slug,
      quantity: parsedQuery.data.quantity,
      mot: parsedQuery.data.mot,
    });

    res.json({
      success: true,
      data: {
        originPin: result.originPin,
        destinationPin: result.destinationPin,
        mot: result.mot,
        pt: result.pt,
        chargeableGrams: result.chargeableGrams,
        shippingPaise: result.shippingPaise,
        delhivery: result.delhivery,
        requestUrl: result.requestUrl,
        provider: 'delhivery',
        environment: getDelhiveryEnvironment(),
        baseUrl: env.delhivery.baseUrl,
      },
    });
  })
);

export default router;
