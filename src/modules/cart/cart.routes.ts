import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { loadUser } from '../../middleware/loadUser.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { param } from '../../lib/params.js';
import { cartService } from './cart.service.js';
import { addCartItemSchema, replaceCartSchema, updateCartItemSchema } from './cart.schema.js';

const router = Router();
router.use(authenticate, loadUser);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const cart = await cartService.getCart(req.user!.id);
    res.json({ success: true, data: { cart } });
  })
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = replaceCartSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid cart', parsed.error.flatten().fieldErrors);
    }
    const cart = await cartService.replace(req.user!.id, parsed.data.items);
    res.json({ success: true, data: { cart } });
  })
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    const cart = await cartService.clear(req.user!.id);
    res.json({ success: true, data: { cart } });
  })
);

router.post(
  '/items',
  asyncHandler(async (req, res) => {
    const parsed = addCartItemSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid cart item', parsed.error.flatten().fieldErrors);
    }
    const cart = await cartService.addItem(
      req.user!.id,
      parsed.data.productId,
      parsed.data.quantity
    );
    res.status(201).json({ success: true, data: { cart } });
  })
);

router.patch(
  '/items/:productId',
  asyncHandler(async (req, res) => {
    const parsed = updateCartItemSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid quantity', parsed.error.flatten().fieldErrors);
    }
    const cart = await cartService.updateItem(
      req.user!.id,
      param(req.params.productId, 'productId'),
      parsed.data.quantity
    );
    res.json({ success: true, data: { cart } });
  })
);

router.delete(
  '/items/:productId',
  asyncHandler(async (req, res) => {
    const cart = await cartService.removeItem(
      req.user!.id,
      param(req.params.productId, 'productId')
    );
    res.json({ success: true, data: { cart } });
  })
);

export default router;
