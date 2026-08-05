import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { loadUser } from '../../middleware/loadUser.js';
import { requireAdmin } from '../../middleware/requireAdmin.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { param } from '../../lib/params.js';
import { productsService } from '../products/products.service.js';
import {
  createProductSchema,
  updateProductSchema,
  listAdminProductsQuerySchema,
} from '../products/products.schema.js';
import {
  createCouponAdminSchema,
  updateCouponAdminSchema,
} from '../coupons/coupons.schema.js';
import { serializeProduct, serializeProductList } from '../products/products.presenter.js';
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
    const parsed = listAdminProductsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid query', parsed.error.flatten().fieldErrors);
    }
    const result = await productsService.listAdmin(parsed.data);
    res.json({ success: true, data: serializeProductList(result.products, result.meta) });
  })
);

/** GET /admin/products/:id — single product for editor */
router.get(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const product = await productsService.getById(param(req.params.id, 'id'));
    if (!product) throw ApiError.notFound('Product not found');
    res.json({ success: true, data: { product: serializeProduct(product) } });
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
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(req.file.mimetype)) {
      throw ApiError.badRequest('Only JPEG, PNG, or WebP images are allowed');
    }
    const url = await productsService.uploadImage(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );
    res.status(201).json({
      success: true,
      data: {
        url,
        kind_hint: 'Use as card (hero) or gallery image when creating/updating the product',
      },
    });
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
    res.status(201).json({ success: true, data: { product: serializeProduct(product) } });
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
    const product = await productsService.update(param(req.params.id, 'id'), parsed.data);
    res.json({ success: true, data: { product: serializeProduct(product) } });
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

/** GET /admin/orders/:id — full order detail with user profile */
router.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const id = param(req.params.id, 'id');
    const detail = await ordersService.getForAdmin(id);
    res.json({ success: true, data: detail });
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

/** GET /admin/payments/:id */
router.get(
  '/payments/:id',
  asyncHandler(async (req, res) => {
    const { paymentsService } = await import('../payments/payments.service.js');
    const result = await paymentsService.getAdmin(param(req.params.id));
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
    const parsed = createCouponAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid coupon', parsed.error.flatten().fieldErrors);
    }
    const { couponsService } = await import('../coupons/coupons.service.js');
    const result = await couponsService.createAdmin(parsed.data);
    res.status(201).json({ success: true, data: { coupon: result } });
  })
);

/** PATCH /admin/coupons/:id */
router.patch(
  '/coupons/:id',
  asyncHandler(async (req, res) => {
    const parsed = updateCouponAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid coupon update', parsed.error.flatten().fieldErrors);
    }
    const { couponsService } = await import('../coupons/coupons.service.js');
    const result = await couponsService.updateAdmin(param(req.params.id), parsed.data);
    res.json({ success: true, data: { coupon: result } });
  })
);

/** GET /admin/support-tickets */
router.get(
  '/support-tickets',
  asyncHandler(async (req, res) => {
    const page = typeof req.query.page === 'string' ? Number(req.query.page) : 1;
    const perPage = typeof req.query.perPage === 'string' ? Number(req.query.perPage) : 20;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { supportService } = await import('../support/support.service.js');
    const result = await supportService.listAdmin(page, perPage, status);
    res.json({ success: true, data: result });
  })
);

/** PATCH /admin/support-tickets/:id */
router.patch(
  '/support-tickets/:id',
  asyncHandler(async (req, res) => {
    const { updateSupportTicketAdminSchema } = await import('../support/support.schema.js');
    const parsed = updateSupportTicketAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid ticket update', parsed.error.flatten().fieldErrors);
    }
    const { supportService } = await import('../support/support.service.js');
    const ticket = await supportService.updateAdmin(param(req.params.id), parsed.data);
    res.json({ success: true, data: { ticket } });
  })
);

export default router;
