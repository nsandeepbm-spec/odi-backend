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

/** POST /admin/mail/welcome — send the registration welcome template (SMTP test). */
router.post(
  '/mail/welcome',
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ to: z.string().email().optional() })
      .strict()
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid body', parsed.error.flatten().fieldErrors);
    }
    const to = (parsed.data.to ?? req.user!.email).trim().toLowerCase();
    const { sendWelcomeEmailNow } = await import('../../lib/mailer/index.js');
    const result = await sendWelcomeEmailNow({
      to,
      name: req.user!.full_name,
    });
    res.json({ success: true, data: { to, sent: result.sent, mode: result.mode } });
  })
);

/** POST /admin/mail/refund — send the refund-processed template (SMTP test). */
router.post(
  '/mail/refund',
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        to: z.string().email().optional(),
        orderNumber: z.string().min(1).optional(),
        amountPaise: z.number().int().positive().optional(),
      })
      .strict()
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid body', parsed.error.flatten().fieldErrors);
    }
    const to = (parsed.data.to ?? req.user!.email).trim().toLowerCase();
    const { sendRefundProcessedEmailNow } = await import('../../lib/mailer/index.js');
    const result = await sendRefundProcessedEmailNow({
      to,
      orderNumber: parsed.data.orderNumber,
      amountPaise: parsed.data.amountPaise,
    });
    res.json({ success: true, data: { to, sent: result.sent, mode: result.mode } });
  })
);

const mailToSchema = z
  .object({ to: z.string().email().optional() })
  .strict();

/** POST /admin/mail/order — send the order-placed template (SMTP test). */
router.post(
  '/mail/order',
  asyncHandler(async (req, res) => {
    const parsed = mailToSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest('Invalid body', parsed.error.flatten().fieldErrors);
    const to = (parsed.data.to ?? req.user!.email).trim().toLowerCase();
    const { sendOrderPlacedEmailNow } = await import('../../lib/mailer/index.js');
    const result = await sendOrderPlacedEmailNow({ to });
    res.json({ success: true, data: { to, sent: result.sent, mode: result.mode } });
  })
);

/** POST /admin/mail/product-live — send the product-live template (SMTP test). */
router.post(
  '/mail/product-live',
  asyncHandler(async (req, res) => {
    const parsed = mailToSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest('Invalid body', parsed.error.flatten().fieldErrors);
    const to = (parsed.data.to ?? req.user!.email).trim().toLowerCase();
    const { sendProductLiveEmailNow } = await import('../../lib/mailer/index.js');
    const result = await sendProductLiveEmailNow({ to });
    res.json({ success: true, data: { to, sent: result.sent, mode: result.mode } });
  })
);

/** POST /admin/mail/cancel — send the order-cancelled template (SMTP test). */
router.post(
  '/mail/cancel',
  asyncHandler(async (req, res) => {
    const parsed = mailToSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest('Invalid body', parsed.error.flatten().fieldErrors);
    const to = (parsed.data.to ?? req.user!.email).trim().toLowerCase();
    const { sendOrderCancelledEmailNow } = await import('../../lib/mailer/index.js');
    const result = await sendOrderCancelledEmailNow({ to });
    res.json({ success: true, data: { to, sent: result.sent, mode: result.mode } });
  })
);

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

/**
 * GET /admin/pickups
 * Needs schedule + scheduled pickup rows with date/time for admin Pickups page.
 */
router.get(
  '/pickups',
  asyncHandler(async (_req, res) => {
    const { fulfillmentService } = await import('../fulfillment/fulfillment.service.js');
    const data = await fulfillmentService.listPickupsForAdmin();
    res.json({ success: true, data });
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

/** POST /admin/orders/:id/shipment — internal/retry only (auto-runs after payment). */
router.post(
  '/orders/:id/shipment',
  asyncHandler(async (req, res) => {
    const { fulfillmentService } = await import('../fulfillment/fulfillment.service.js');
    const result = await fulfillmentService.createShipmentForOrder(param(req.params.id, 'id'));
    res.json({ success: true, data: { order: result.order } });
  })
);

/**
 * GET /admin/orders/:id/packing-slip
 * Delhivery packing slip JSON for the order waybill (for custom shipping label PDF).
 */
router.get(
  '/orders/:id/packing-slip',
  asyncHandler(async (req, res) => {
    const { fulfillmentService } = await import('../fulfillment/fulfillment.service.js');
    const data = await fulfillmentService.getPackingSlipForOrder(param(req.params.id, 'id'));
    res.json({ success: true, data });
  })
);

/**
 * GET /admin/orders/:id/shipping-label
 * Official Delhivery Generate Shipping Label PDF
 * (GET /api/p/packing_slip?wbns=…&pdf=true&pdf_size=4R).
 * Docs: pdf_size=4R (4×6) or A4 (8×11). Admin UI renders custom 4R from packing-slip JSON.
 * @see https://one.delhivery.com/developer-portal/document/b2c/detail/generate-shipping-label
 */
router.get(
  '/orders/:id/shipping-label',
  asyncHandler(async (req, res) => {
    const { env } = await import('../../config/env.js');
    const rawSize =
      typeof req.query.pdfSize === 'string' ? req.query.pdfSize.trim().toUpperCase() : env.delhivery.labelPdfSize;
    const pdfSize = (rawSize === 'A4' ? 'A4' : '4R') as '4R' | 'A4';

    const { fulfillmentService } = await import('../fulfillment/fulfillment.service.js');
    const label = await fulfillmentService.getShippingLabelPdfForOrder(param(req.params.id, 'id'), {
      pdfSize,
    });

    const filename = `Delhivery-Label-${label.waybill}.pdf`;
    res.setHeader('Content-Type', label.contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-ODI-Label-Source', label.sourceUrl ? 'delhivery-url' : 'delhivery-bytes');
    res.send(label.bytes);
  })
);

/**
 * GET /admin/orders/:id/tracking
 * Live Delhivery shipment status + scan history.
 */
router.get(
  '/orders/:id/tracking',
  asyncHandler(async (req, res) => {
    const { fulfillmentService } = await import('../fulfillment/fulfillment.service.js');
    const tracking = await fulfillmentService.getTrackingForOrder(param(req.params.id, 'id'));
    res.json({ success: true, data: { tracking } });
  })
);

const pickupBodySchema = z
  .object({
    pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    pickupTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
    packageCount: z.number().int().positive().max(500).optional(),
  })
  .strict();

/** POST /admin/orders/:id/pickup — manual Delhivery pickup request. */
router.post(
  '/orders/:id/pickup',
  asyncHandler(async (req, res) => {
    const parsed = pickupBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid pickup request', parsed.error.flatten().fieldErrors);
    }
    const { fulfillmentService } = await import('../fulfillment/fulfillment.service.js');
    const result = await fulfillmentService.requestPickupForOrder(param(req.params.id, 'id'), parsed.data);
    res.json({ success: true, data: { order: result.order } });
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

/** GET /admin/contact-inquiries */
router.get(
  '/contact-inquiries',
  asyncHandler(async (req, res) => {
    const page = typeof req.query.page === 'string' ? Number(req.query.page) : 1;
    const perPage = typeof req.query.perPage === 'string' ? Number(req.query.perPage) : 20;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { inquiriesService } = await import('../inquiries/inquiries.service.js');
    const result = await inquiriesService.listContactAdmin(page, perPage, status);
    res.json({ success: true, data: result });
  })
);

/** PATCH /admin/contact-inquiries/:id */
router.patch(
  '/contact-inquiries/:id',
  asyncHandler(async (req, res) => {
    const { updateInquiryAdminSchema } = await import('../inquiries/inquiries.schema.js');
    const parsed = updateInquiryAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid inquiry update', parsed.error.flatten().fieldErrors);
    }
    const { inquiriesService } = await import('../inquiries/inquiries.service.js');
    const inquiry = await inquiriesService.updateContactAdmin(param(req.params.id), parsed.data);
    res.json({ success: true, data: { inquiry } });
  })
);

/** GET /admin/career-applications */
router.get(
  '/career-applications',
  asyncHandler(async (req, res) => {
    const page = typeof req.query.page === 'string' ? Number(req.query.page) : 1;
    const perPage = typeof req.query.perPage === 'string' ? Number(req.query.perPage) : 20;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { inquiriesService } = await import('../inquiries/inquiries.service.js');
    const result = await inquiriesService.listCareerAdmin(page, perPage, status);
    res.json({ success: true, data: result });
  })
);

/** PATCH /admin/career-applications/:id */
router.patch(
  '/career-applications/:id',
  asyncHandler(async (req, res) => {
    const { updateInquiryAdminSchema } = await import('../inquiries/inquiries.schema.js');
    const parsed = updateInquiryAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid application update', parsed.error.flatten().fieldErrors);
    }
    const { inquiriesService } = await import('../inquiries/inquiries.service.js');
    const application = await inquiriesService.updateCareerAdmin(param(req.params.id), parsed.data);
    res.json({ success: true, data: { application } });
  })
);

/** GET /admin/cancels — Cancel Management */
router.get(
  '/cancels',
  asyncHandler(async (req, res) => {
    const page = typeof req.query.page === 'string' ? Number(req.query.page) : 1;
    const perPage = typeof req.query.perPage === 'string' ? Number(req.query.perPage) : 50;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { cancelsService } = await import('../cancels/cancels.service.js');
    const result = await cancelsService.listAdmin(page, perPage, status);
    res.json({ success: true, data: result });
  })
);

/** PATCH /admin/cancels/:id — approve / reject (Delhivery cancel on approve) */
router.patch(
  '/cancels/:id',
  asyncHandler(async (req, res) => {
    const { reviewCancelSchema } = await import('../cancels/cancels.schema.js');
    const parsed = reviewCancelSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid cancel review', parsed.error.flatten().fieldErrors);
    }
    const { cancelsService } = await import('../cancels/cancels.service.js');
    const cancel = await cancelsService.review(
      param(req.params.id),
      req.user!.id,
      parsed.data.decision,
      parsed.data.adminNote
    );
    res.json({ success: true, data: { cancel } });
  })
);

/** GET /admin/refunds — Refund Management */
router.get(
  '/refunds',
  asyncHandler(async (req, res) => {
    const page = typeof req.query.page === 'string' ? Number(req.query.page) : 1;
    const perPage = typeof req.query.perPage === 'string' ? Number(req.query.perPage) : 50;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { cancelsService } = await import('../cancels/cancels.service.js');
    const result = await cancelsService.listRefundsAdmin(page, perPage, status);
    res.json({ success: true, data: result });
  })
);

/** GET /admin/refunds/:id — refund request + customer (admin then loads order by orderId) */
router.get(
  '/refunds/:id',
  asyncHandler(async (req, res) => {
    const { cancelsService } = await import('../cancels/cancels.service.js');
    const refund = await cancelsService.getRefundAdmin(param(req.params.id));
    res.json({ success: true, data: { refund } });
  })
);

/** PATCH /admin/refunds/:id — approve/completed runs Razorpay refund; reject closes without payout */
router.patch(
  '/refunds/:id',
  asyncHandler(async (req, res) => {
    const { reviewRefundSchema } = await import('../cancels/cancels.schema.js');
    const parsed = reviewRefundSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid refund review', parsed.error.flatten().fieldErrors);
    }
    const { cancelsService } = await import('../cancels/cancels.service.js');
    const refund = await cancelsService.reviewRefund(
      param(req.params.id),
      req.user!.id,
      parsed.data.decision,
      parsed.data.adminNote
    );
    res.json({ success: true, data: { refund } });
  })
);

/** GET /admin/legal — list pages + company card */
router.get(
  '/legal',
  asyncHandler(async (_req, res) => {
    const { legalService } = await import('../legal/legal.service.js');
    const result = await legalService.listAdmin();
    res.json({ success: true, data: result });
  })
);

/** PUT /admin/legal/company — update contact card shown on legal pages */
router.put(
  '/legal/company',
  asyncHandler(async (req, res) => {
    const { updateLegalCompanySchema } = await import('../legal/legal.schema.js');
    const parsed = updateLegalCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid company details', parsed.error.flatten().fieldErrors);
    }
    const { legalService } = await import('../legal/legal.service.js');
    const company = await legalService.updateCompany(parsed.data);
    res.json({ success: true, data: { company } });
  })
);

/** POST /admin/legal/:slug/restore — replace page with official seeded copy */
router.post(
  '/legal/:slug/restore',
  asyncHandler(async (req, res) => {
    const { legalSlugSchema } = await import('../legal/legal.schema.js');
    const parsed = legalSlugSchema.safeParse(param(req.params.slug, 'slug'));
    if (!parsed.success) throw ApiError.notFound('Legal page not found');
    const { legalService } = await import('../legal/legal.service.js');
    const page = await legalService.restorePage(parsed.data, req.user!.id);
    const company = (await legalService.getAdmin(parsed.data)).company;
    res.json({ success: true, data: { page, company } });
  })
);

/** GET /admin/legal/:slug */
router.get(
  '/legal/:slug',
  asyncHandler(async (req, res) => {
    const { legalSlugSchema } = await import('../legal/legal.schema.js');
    const parsed = legalSlugSchema.safeParse(param(req.params.slug, 'slug'));
    if (!parsed.success) throw ApiError.notFound('Legal page not found');
    const { legalService } = await import('../legal/legal.service.js');
    const result = await legalService.getAdmin(parsed.data);
    res.json({ success: true, data: result });
  })
);

/** PUT /admin/legal/:slug */
router.put(
  '/legal/:slug',
  asyncHandler(async (req, res) => {
    const { legalSlugSchema, updateLegalPageSchema } = await import('../legal/legal.schema.js');
    const slugParsed = legalSlugSchema.safeParse(param(req.params.slug, 'slug'));
    if (!slugParsed.success) throw ApiError.notFound('Legal page not found');
    const parsed = updateLegalPageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid legal page', parsed.error.flatten().fieldErrors);
    }
    const { legalService } = await import('../legal/legal.service.js');
    const page = await legalService.updatePage(slugParsed.data, parsed.data, req.user!.id);
    res.json({ success: true, data: { page } });
  })
);

export default router;
