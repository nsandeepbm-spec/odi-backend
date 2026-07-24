import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/user/user.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import productsRoutes from './modules/products/products.routes.js';
import reviewsRoutes from './modules/reviews/reviews.routes.js';
import reviewItemRoutes from './modules/reviews/review-item.routes.js';
import cartRoutes from './modules/cart/cart.routes.js';
import couponsRoutes from './modules/coupons/coupons.routes.js';
import checkoutRoutes from './modules/checkout/checkout.routes.js';
import ordersRoutes from './modules/orders/orders.routes.js';
import paymentsRoutes from './modules/payments/payments.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  if (env.trustProxy !== false) {
    app.set('trust proxy', env.trustProxy);
  }
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    })
  );

  // Capture raw body for Razorpay webhook HMAC; JSON-parse everything else.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        if (req.url?.startsWith('/payments/webhook')) {
          (req as { rawBody?: string }).rawBody = buf.toString('utf8');
        }
      },
    })
  );
  app.use(morgan(env.isProd ? 'combined' : 'dev'));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { success: false, error: { message: 'Too many requests, slow down.' } },
    })
  );

  app.use('/auth', authRoutes);
  app.use('/user', userRoutes);
  app.use('/users', usersRoutes);
  // Mount before /products so /:slug/reviews is not swallowed by product detail.
  app.use('/products/:slug/reviews', reviewsRoutes);
  app.use('/products', productsRoutes);
  app.use('/reviews', reviewItemRoutes);
  app.use('/cart', cartRoutes);
  app.use('/coupons', couponsRoutes);
  app.use('/checkout', checkoutRoutes);
  app.use('/orders', ordersRoutes);
  app.use('/payments', paymentsRoutes);
  app.use('/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
