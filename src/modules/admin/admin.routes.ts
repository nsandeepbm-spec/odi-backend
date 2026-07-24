import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { loadUser } from '../../middleware/loadUser.js';
import { requireAdmin } from '../../middleware/requireAdmin.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { param } from '../../lib/params.js';
import { productsService } from '../products/products.service.js';
import { createProductSchema, updateProductSchema } from '../products/products.schema.js';
import { ordersService } from '../orders/orders.service.js';
import { adminOverviewService } from './admin.overview.service.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authenticate, loadUser, requireAdmin);

const statusSchema = z
  .object({
    status: z.enum([
      'pending',
      'paid',
      'processing',
      'shipped',
      'delivered',
      'cancelled',
      'refunded',
    ]),
  })
  .strict();

/** GET /admin/overview — KPIs, chart, catalog snapshot, recent orders */
router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const overview = await adminOverviewService.getOverview();
    res.json({ success: true, data: overview });
  })
);

/** GET /admin/products */
router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const result = await productsService.listAdmin({
      page: Number(req.query.page ?? 1),
      perPage: Number(req.query.perPage ?? 20),
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });
    res.json({ success: true, data: result });
  })
);

/** POST /admin/products/upload-image */
router.post(
  '/products/upload-image',
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw ApiError.badRequest('No image file provided');
    }
    const url = await productsService.uploadImage(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );
    res.json({ success: true, data: { url } });
  })
);

/** POST /admin/products */
router.post(
  '/products',
  asyncHandler(async (req, res) => {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid product', parsed.error.flatten().fieldErrors);
    }
    const product = await productsService.create(parsed.data);
    res.status(201).json({ success: true, data: { product } });
  })
);

/** PATCH /admin/products/:id */
router.patch(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid product update', parsed.error.flatten().fieldErrors);
    }
    const product = await productsService.update(param(req.params.id), parsed.data);
    res.json({ success: true, data: { product } });
  })
);

/** GET /admin/orders */
router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const result = await ordersService.listAdmin(
      Number(req.query.page ?? 1),
      Number(req.query.perPage ?? 20),
      typeof req.query.status === 'string' ? req.query.status : undefined
    );
    res.json({ success: true, data: result });
  })
);

/** PATCH /admin/orders/:id/status */
router.patch(
  '/orders/:id/status',
  asyncHandler(async (req, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid status', parsed.error.flatten().fieldErrors);
    }
    const order = await ordersService.updateStatus(param(req.params.id), parsed.data.status);
    res.json({ success: true, data: { order } });
  })
);

/** GET /admin/payments */
router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const { paymentsService } = await import('../payments/payments.service.js');
    const result = await paymentsService.listAdmin(
      Number(req.query.page ?? 1),
      Number(req.query.perPage ?? 50)
    );
    res.json({ success: true, data: result });
  })
);

/** GET /admin/coupons */
router.get(
  '/coupons',
  asyncHandler(async (req, res) => {
    const { couponsService } = await import('../coupons/coupons.service.js');
    const result = await couponsService.listAdmin(
      Number(req.query.page ?? 1),
      Number(req.query.perPage ?? 50)
    );
    res.json({ success: true, data: result });
  })
);

/** POST /admin/coupons */
router.post(
  '/coupons',
  asyncHandler(async (req, res) => {
    const { couponsService } = await import('../coupons/coupons.service.js');
    const result = await couponsService.createAdmin(req.body);
    res.json({ success: true, data: { coupon: result } });
  })
);

/** PATCH /admin/coupons/:id */
router.patch(
  '/coupons/:id',
  asyncHandler(async (req, res) => {
    const { couponsService } = await import('../coupons/coupons.service.js');
    const result = await couponsService.updateAdmin(param(req.params.id), req.body);
    res.json({ success: true, data: { coupon: result } });
  })
);

export default router;
