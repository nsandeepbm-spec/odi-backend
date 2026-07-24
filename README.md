# ODI Backend

TypeScript Express API for the ODI Kids storefront + dashboards.

- **Auth:** Firebase Authentication (Google + email/password). Frontend sends `Authorization: Bearer <idToken>`.
- **Database:** Supabase (Postgres) via service-role key. RLS blocks direct client access.
- **Payments:** Razorpay (test or live keys). Orders are confirmed via signed webhook or client verify.

## Setup

```bash
npm install
copy .env.example .env   # fill Supabase + Firebase + Razorpay values
npm run dev              # http://localhost:5000
```

### SQL (run in Supabase SQL Editor, in order)

1. `sql/001_create_users.sql` — users profile table
2. `sql/002_commerce.sql` — schema only (products, images, reviews, addresses, cart, coupons, orders, payments)
3. `sql/003_seed_catalog.sql` — **optional** demo products + images + `ODI10` coupon (skip if you add products yourself)

`002` drops any previous stub commerce tables before recreating. Safe to re-run on empty projects; **will wipe commerce data**.

### Product images

1. Create a public Storage bucket (default name `product-images`).
2. Upload kit images.
3. Put the **public URLs** into `product_images.url` (via admin API or by editing rows; the optional seed uses local path placeholders).

## API routes

Response shape: `{ success, data }` or `{ success: false, error: { message } }`.

| Method | Route | Auth | Description |
| ------ | ----- | ---- | ----------- |
| GET | `/health` | — | Health check |
| POST | `/auth/sync` | Bearer | Sync Firebase user → Supabase profile |
| GET | `/user/me` | Bearer | Current profile |
| PATCH | `/user/me` | Bearer | Update profile |
| GET | `/user/addresses` | Bearer | List saved addresses |
| POST | `/user/addresses` | Bearer | Create address |
| PATCH | `/user/addresses/:id` | Bearer | Update address |
| DELETE | `/user/addresses/:id` | Bearer | Delete address |
| GET | `/users` | Admin | List customers |
| GET | `/products` | — | Catalog (`?category=&q=&page=&perPage=`) |
| GET | `/products/:slug` | — | Product + images + rating summary |
| GET | `/products/:slug/reviews` | — | Paginated reviews |
| POST | `/products/:slug/reviews` | Bearer | Create review (one per user/product) |
| PATCH | `/reviews/:id` | Bearer | Edit own review |
| DELETE | `/reviews/:id` | Bearer | Delete own review (or admin) |
| GET | `/cart` | Bearer | Get cart |
| PUT | `/cart` | Bearer | Replace cart `{ items: [{ productId, quantity }] }` |
| DELETE | `/cart` | Bearer | Clear cart |
| POST | `/cart/items` | Bearer | Add / increment item |
| PATCH | `/cart/items/:productId` | Bearer | Set quantity |
| DELETE | `/cart/items/:productId` | Bearer | Remove item |
| POST | `/coupons/validate` | Bearer | Preview discount `{ code, items? }` |
| POST | `/checkout/sessions` | Bearer + `Idempotency-Key` | Create pending order + Razorpay order |
| GET | `/orders` | Bearer | My orders |
| GET | `/orders/:id` | Bearer | Order detail + items + payments |
| POST | `/payments/webhook` | Razorpay signature | Mark paid (idempotent) |
| POST | `/payments/verify` | Bearer | Client signature verify after Checkout |
| GET | `/admin/overview` | Admin | KPIs, revenue series, catalog snapshot, recent orders |
| GET | `/admin/products` | Admin | All products |
| POST | `/admin/products` | Admin | Create product (+ images) |
| PATCH | `/admin/products/:id` | Admin | Update product |
| GET | `/admin/orders` | Admin | All orders |
| PATCH | `/admin/orders/:id/status` | Admin | Update fulfillment status |

### Checkout session body

```json
{
  "useCart": true,
  "addressId": "uuid",
  "couponCode": "ODI10"
}
```

Or inline:

```json
{
  "items": [{ "productId": "uuid", "quantity": 1 }],
  "shippingAddress": {
    "first_name": "Asha",
    "last_name": "K",
    "phone": "9999999999",
    "street": "12 MG Road",
    "city": "Bengaluru",
    "postal_code": "560001",
    "country": "IN"
  }
}
```

Returns `{ orderId, orderNumber, razorpayOrderId, amount, currency, keyId }`.

## Auth flow

```
Frontend                         Backend                    Supabase
────────                         ───────                    ────────
Firebase sign-in
  → ID token
  → POST /auth/sync ────────────► verifyIdToken
                                   upsert users row ───────► users
  ← profile row
  → GET /user/me (later calls)
```

## Checkout / payment flow

```
POST /checkout/sessions  → pending order + Razorpay order (prices from DB)
Frontend Razorpay modal  → customer pays
POST /payments/verify    → HMAC check → mark paid + decrement stock
  and/or
POST /payments/webhook   → same idempotent mark-paid path
GET  /orders/:id         → poll status
```

## Project structure

```
src/
├── server.ts
├── app.ts
├── types.ts
├── config/            env, firebase, supabase
├── lib/               pagination, money, razorpay, params
├── middleware/        authenticate, loadUser, requireAdmin, errors
├── modules/
│   ├── auth/
│   ├── user/          /me + mounts addresses
│   ├── users/         admin customer list + shared users.service
│   ├── addresses/
│   ├── products/
│   ├── reviews/
│   ├── cart/
│   ├── coupons/
│   ├── checkout/
│   ├── orders/
│   ├── payments/
│   └── admin/
└── utils/
sql/
├── 001_create_users.sql
├── 002_commerce.sql
└── 003_seed_catalog.sql   # optional
```

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Dev server with hot reload (tsx) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled production build |
| `npm run typecheck` | Type-check without emit |

## Make yourself admin

After first sign-in:

```sql
update public.users set role = 'admin' where email = 'your-email@example.com';
```

## Documentation

- Agent & architecture rules: `AGENTS.md`
- Monorepo overview: `../AGENTS.md`

### Keep this README updated

Update this file in the **same change** when you add or modify routes, env vars, SQL migrations, auth/payment flow, or project structure.
