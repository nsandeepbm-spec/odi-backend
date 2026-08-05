import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { param } from '../../lib/params.js';
import { productsService } from './products.service.js';
import { listProductsQuerySchema } from './products.schema.js';
import { serializeProduct, serializeProductList } from './products.presenter.js';

const router = Router();

/** GET /products — public catalog (live + coming_soon only) */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = listProductsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid query', parsed.error.flatten().fieldErrors);
    }
    const result = await productsService.listPublic(parsed.data);
    res.json({ success: true, data: serializeProductList(result.products, result.meta) });
  })
);

/** GET /products/:slug — product detail with media + ratings */
router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const product = await productsService.getBySlug(param(req.params.slug, 'slug'));
    if (!product) throw ApiError.notFound('Product not found');
    res.json({ success: true, data: { product: serializeProduct(product) } });
  })
);

export default router;
