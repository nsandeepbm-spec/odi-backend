# ODI Backend — Agent Guide (`odi-backend`)

Express 5 + TypeScript + Firebase Admin (token verify) + Supabase (Postgres, service role) + Razorpay.

---

## Architecture principles

1. **Domain-first modules** — one folder per business area, not global `controllers/`.
2. **Thin routes, fat services** — routes validate with Zod; services own DB logic.
3. **Firebase owns auth** — backend verifies ID tokens only; no custom JWT issuance.
4. **Supabase is private** — service-role key on server only; RLS deny-all for clients.
5. **Fail fast** — validate env at startup (`config/env.ts`), validate bodies with Zod.
6. **Money in paise** — integers only; never trust client prices or stock.
7. **Payment confirmation** — webhook and/or signed client verify; both idempotent.

---

## Module map

```
src/modules/
├── auth/          POST /auth/sync
├── user/          GET/PATCH /user/me + /user/addresses/*
├── users/         GET /users (admin) + shared users.service
├── addresses/     address CRUD service
├── products/      public catalog + admin writes via /admin
├── reviews/       nested under /products/:slug/reviews + /reviews/:id
├── cart/          server-side cart
├── coupons/       POST /coupons/validate
├── checkout/      POST /checkout/sessions
├── orders/        GET /orders, /orders/:id
├── payments/      webhook + verify + mark-paid
└── admin/         /admin/products, /admin/orders
```

Shared helpers: `src/lib/{pagination,money,razorpay,params}.ts`.

SQL: `sql/001_create_users.sql`, `sql/002_commerce.sql` (schema), optional `sql/003_seed_catalog.sql`.

---

## API conventions

### Response envelope

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "message": "...", "details": {} } }
```

### Auth middleware

```
Public:     (none)
Authed:     authenticate → loadUser
Admin:      authenticate → loadUser → requireAdmin
Webhook:    Razorpay HMAC (raw body on /payments/webhook)
```

### Pagination

`?page=1&perPage=20` — clamp `perPage` max 100 via `lib/pagination.ts`.

### Checkout

- Require `Idempotency-Key` header (8–120 chars).
- Re-read product price/stock from DB.
- Snapshot line items on the order.
- Create Razorpay order; store `razorpay_order_id`.
- Mark paid once → decrement stock → bump coupon `used_count`.

---

## Database (commerce)

| Table | Notes |
| --- | --- |
| `products` | status: draft/live/coming_soon/archived; kit_contents jsonb; categories text[] |
| `product_images` | Supabase Storage public URLs; one primary per product |
| `product_reviews` | unique (product_id, user_id) |
| `user_addresses` | saved shipping |
| `cart_items` | unique (user_id, product_id) |
| `coupons` | percent or fixed_paise |
| `orders` | status machine + money + shipping jsonb + idempotency_key |
| `order_items` | price/name/slug/image snapshots |
| `payments` | razorpay ids + status |

Order status: `pending → paid → processing → shipped → delivered` (also `cancelled` / `refunded`).

---

## Environment

Required: `FIREBASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Payments: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

Optional: `SUPABASE_STORAGE_BUCKET=product-images`, `TRUST_PROXY`, `CORS_ORIGIN`.

See `.env.example`.

---

## How to add a feature

1. SQL migration under `sql/` (numbered).
2. Module `*.schema.ts` / `*.service.ts` / `*.routes.ts`.
3. Mount in `app.ts`.
4. Update `README.md` route table + `.env.example` if needed.
5. Update this file if conventions change.

**Rule:** code without README updates is incomplete.

---

## Security checklist

- [ ] No raw card data endpoints
- [ ] Webhook HMAC verified (strict in production)
- [ ] Service-role key never in frontend
- [ ] Rate limit before business routes; `/health` outside limiter
- [ ] Users only see own orders/cart/addresses
