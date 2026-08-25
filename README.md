# ODI Backend

TypeScript Express API for the ODI Kids storefront + dashboards.

- **Auth:** Firebase Authentication (Google + email/password). Frontend sends `Authorization: Bearer <idToken>`.
- **Database:** Supabase (Postgres) via service-role key. RLS blocks direct client access.
- **Payments:** Razorpay (test or live keys). Orders are confirmed via signed webhook or client verify.
- **Shipping:** Delhivery Express (staging by default). Pin-code serviceability via `GET /shipping/pincode/:pincode`; expected TAT via `GET /shipping/tat/:destinationPin`; shipping cost via `GET /shipping/charges/:destinationPin`.
- **Email:** Gmail SMTP (`odistudio24@gmail.com`) — welcome, order placed, product-live. Set `SMTP_PASS` to a Google App Password.

## Setup

```bash
npm install
copy .env.example .env   # fill Supabase + Firebase + Razorpay + SMTP_PASS
npm run dev              # http://localhost:5000
```

### Email (Gmail)

1. Use Google account **odistudio24@gmail.com**.
2. Enable **2-Step Verification**, then create an **App password**.
3. Set in `.env`:
   - `MAIL_FROM=ODI <odistudio24@gmail.com>`
   - `SMTP_USER=odistudio24@gmail.com`
   - `SMTP_PASS=<app-password>`
   - `FRONTEND_URL=` your site (localhost or ngrok URL for CTA links)

Without `SMTP_PASS`, the API still runs and logs emails to the console.

### Delhivery (shipping)

`.env` has **two full credential groups**. Keep exactly one active:

| Block | Account | Host | Warehouse | Wallet |
|-------|---------|------|-----------|--------|
| **STAGING** (default for local) | B2B JWT | `staging-express.delhivery.com` | `ODI Staging` · Delhi `110001` | Not required |
| **PRODUCTION** | B2C hex | `track.delhivery.com` | `ODI B2C` · Mohali `160074` | Required for AWB |

**Switch:** comment the whole active block, uncomment the other. Do not mix lines (e.g. staging warehouse + production token).

```env
# Shared
DELHIVERY_STAGING_BASE_URL=https://staging-express.delhivery.com
DELHIVERY_PRODUCTION_BASE_URL=https://track.delhivery.com
DELHIVERY_MOT=S
DELHIVERY_PDT=Pre-paid

# --- STAGING (local QA) ---
DELHIVERY_ENV=staging
DELHIVERY_ACCOUNT_TYPE=b2b
DELHIVERY_STAGING_TOKEN=<b2b-jwt>
DELHIVERY_CLIENT_NAME=OTI B2B-b2b
DELHIVERY_ORIGIN_PIN=110001
DELHIVERY_PICKUP_LOCATION_NAME=ODI Staging
# Warehouse + label return (keep return address short — city goes in DELHIVERY_WAREHOUSE_RETURN_CITY)
DELHIVERY_WAREHOUSE_REGISTERED_NAME=ODI
DELHIVERY_WAREHOUSE_ADDRESS=Connaught Place, New Delhi
DELHIVERY_WAREHOUSE_CITY=New Delhi
DELHIVERY_WAREHOUSE_STATE=Delhi
DELHIVERY_WAREHOUSE_RETURN_ADDRESS=Connaught Place
DELHIVERY_WAREHOUSE_RETURN_CITY=New Delhi
# Label: Delhivery docs support 4R (4×6) and A4 (8×11). Admin UI always prints 4R from JSON.
DELHIVERY_LABEL_PDF_SIZE=4R

# --- PRODUCTION (go live; comment staging first) ---
# DELHIVERY_ENV=production
# DELHIVERY_ACCOUNT_TYPE=b2c
# DELHIVERY_PRODUCTION_TOKEN=<b2c-hex>
# DELHIVERY_CLIENT_NAME=OTI XB-cdp
# DELHIVERY_ORIGIN_PIN=160074
# DELHIVERY_PICKUP_LOCATION_NAME=ODI B2C
# + warehouse address fields for Mohali
```

After changing `.env`, restart `npm run dev`. Boot log should show `Delhivery staging b2b … pickup="ODI Staging"` or `production b2c … pickup="ODI B2C"`.

Admin Shipments → **Retry Shipment** / **Request Pickup** against the active env. Register the warehouse in Delhivery One for the same env/token the API uses.

3. Pincode API path (built by backend): `{ACTIVE_BASE}/c/api/pin-codes/json/?filter_codes={pincode}`

4. Expected TAT path: `{ACTIVE_BASE}/api/dc/expected_tat?origin_pin={DELHIVERY_ORIGIN_PIN}&destination_pin={pin}&mot={DELHIVERY_MOT}`

5. Shipping charges path: `{ACTIVE_BASE}/api/kinko/v1/invoice/charges/.json?md={MOT}&ss=Delivered&o_pin={ORIGIN}&d_pin={pin}&cgm={grams}&pt=Pre-paid`

6. **Fulfillment** (after payment): Fetch Waybill + `POST /api/cmu/create.json` — automatic; stores `orders.delhivery_waybill` and sets status `processing`.

Test:
- `GET http://localhost:5000/shipping/pincode/110001`
- `GET http://localhost:5000/shipping/tat/136118`
- `GET http://localhost:5000/shipping/charges/136118?slug=space-explorer&quantity=1`

### SQL (run once in Supabase SQL Editor)

Run **`sql/schema.sql`** — single source of truth for users + commerce (products, images, reviews, favorites, notify-me waitlist, notifications, support tickets, contact inquiries, career applications, addresses, cart, coupons, orders, payments, cancels, refunds).

**Warning:** re-running drops and recreates commerce tables (wipes catalog/orders). Safe on empty projects only. Do not re-run on a live DB that already has data.

After first sign-in, promote yourself:

```sql
update public.users set role = 'admin', is_super_admin = true where email = 'you@example.com';
```

Add catalog via **Admin → Products** (or API). Optional promo coupons can be inserted manually in SQL.

### Product images

1. Create a public Storage bucket named `product-images` (or set `SUPABASE_STORAGE_BUCKET`).
2. Upload via **Admin → Products → New/Edit** (`POST /admin/products/upload-image`) or Supabase Dashboard.
3. Each product has:
   - **One `card` image** — hero on checkout top + product cards
   - **Up to 5 `gallery` images** — thumbnail strip under the hero
4. Checkout tabs use: `long_description`, `publisher` + `publisher_bio`, `author` + `author_bio` (columns in `sql/schema.sql`).
5. Public API returns `product.media: { card, gallery, all }` on `GET /products/:slug`.

## API routes

Response shape: `{ success, data }` or `{ success: false, error: { message } }`.

**Full API reference (all requests/responses):** root [`../api.md`](../api.md) — update it whenever routes change.

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
| GET | `/user/favorites` | Bearer | List saved products (wishlist) |
| POST | `/user/favorites` | Bearer | Save favorite `{ slug }` |
| DELETE | `/user/favorites/:slug` | Bearer | Remove favorite |
| GET | `/user/notify-me` | Bearer | List product launch waitlist |
| POST | `/user/notify-me` | Bearer | Subscribe Notify Me `{ slug }` (coming_soon only) |
| DELETE | `/user/notify-me/:slug` | Bearer | Unsubscribe Notify Me |
| GET | `/user/notifications` | Bearer | List notifications (`?includeCleared` for history) |
| GET | `/user/notifications/preview` | Bearer | Latest 4 uncleared + unreadCount (bell) |
| GET | `/user/notifications/unread-count` | Bearer | Unread badge (excludes cleared) |
| PATCH | `/user/notifications/:id/read` | Bearer | Mark one read |
| POST | `/user/notifications/read-all` | Bearer | Mark uncleared unread as read |
| POST | `/user/notifications/clear` | Bearer | Clear bell (sets `cleared_at`; history kept) |
| GET | `/user/support-tickets` | Bearer | List my support tickets |
| POST | `/user/support-tickets` | Bearer | Create support ticket |
| GET | `/user/reviews` | Bearer | List signed-in user's reviews |
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
| POST | `/checkout/sessions` | Bearer + `Idempotency-Key` | Create pending order + Razorpay order (validates Delhivery PIN) |
| GET | `/orders` | Bearer | My orders |
| GET | `/orders/:id` | Bearer | Order detail + items + payments |
| GET | `/orders/:id/tracking` | Bearer | Live Delhivery status + scans (owner) |
| POST | `/payments/webhook` | Razorpay signature | Mark paid (idempotent) |
| POST | `/payments/verify` | Bearer | Client signature verify after Checkout |
| GET | `/shipping/pincode/:pincode` | none | Delhivery pin-code serviceability |
| GET | `/shipping/tat/:destinationPin` | none | Delhivery expected TAT (origin → destination) |
| GET | `/shipping/charges/:destinationPin` | none | Delhivery shipping cost (`?slug&quantity`) |
| POST | `/contact` | none | Save contact / service inquiry (no email) |
| POST | `/careers` | none | Save career application (no email) |
| GET | `/admin/overview` | Admin | KPIs, revenue series, catalog snapshot, recent orders |
| GET | `/admin/products` | Admin | Catalog list (`?page&perPage&status&q`) |
| GET | `/admin/products/:id` | Admin | Single product (editor) |
| POST | `/admin/products/upload-image` | Admin | Upload to Storage → `{ url }` |
| POST | `/admin/products` | Admin | Create product (+ card/gallery images) |
| PATCH | `/admin/products/:id` | Admin | Update product |

### Product API contract (admin + public)

All product responses use the same serializer (`products.presenter.ts`).

**Envelope**

```json
{ "success": true, "data": { "product": { ... } } }
{ "success": true, "data": { "products": [ ... ], "meta": { "total", "page", "perPage", "totalPages" } } }
{ "success": false, "error": { "message": "...", "details": {} } }
```

**Product object (fields marketing / checkout need)**

| Field | Notes |
| --- | --- |
| `slug`, `name`, `volume` | URL id + display |
| `description`, `long_description` | Short + detail copy |
| `price_paise`, `compare_at_paise` | Money in paise only |
| `stock_qty`, `status` | `live` required to sell |
| `features[]`, `categories[]`, `kit_contents[]` | Storefront sections |
| `author`, `publisher`, `language`, `age_range`, `pages`, `tag` | Meta tabs |
| `media.card` | Hero image (checkout top / product cards) |
| `media.gallery[]` | Thumbnail strip (up to 8) |
| `media.all[]` | card + gallery flat list |
| `rating.avg` / `rating.count` | Aggregates (also `rating_avg`, `rating_count`) |
| `available` | `status === live && stock_qty > 0` |

**Create / update rules**

- Prices in **paise** integers
- `compare_at_paise` ≥ `price_paise` when set
- Status `live` requires at least one **card** image
- Images: max 9 total (1 card + 8 gallery); each `{ url, kind: "card"|"gallery", alt?, sort_order? }`
- Admin auth: Firebase Bearer + `role=admin`

**Public vs admin**

| | Public `GET /products` | Admin `GET /admin/products` |
| --- | --- | --- |
| Auth | none | Admin |
| Statuses | `live`, `coming_soon` only | all (`draft`…`archived`) |
| Lookup | by `slug` | by `id` (UUID) |

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/admin/orders` | Admin | All orders |
| GET | `/admin/orders/:id` | Admin | Order detail + items + payments + user |
| PATCH | `/admin/orders/:id/status` | Admin | Update fulfillment status |
| POST | `/admin/orders/:id/shipment` | Admin | Retry Delhivery create (auto also runs after payment) |
| GET | `/admin/pickups` | Admin | Needs + scheduled pickup rows (date/time) |
| GET | `/admin/orders/:id/shipping-label` | Admin | Delhivery PDF proxy (optional; UI renders from `/packing-slip`) |
| GET | `/admin/orders/:id/packing-slip` | Admin | Packing slip JSON (not used for Label button) |
| GET | `/admin/orders/:id/tracking` | Admin | Live Delhivery status + scans |
| POST | `/admin/orders/:id/pickup` | Admin | Manual Delhivery pickup request |
| GET | `/admin/payments` | Admin | Payment list + KPIs |
| GET | `/admin/payments/:id` | Admin | Payment detail + linked order + user |
| GET | `/admin/support-tickets` | Admin | Customer support tickets |
| PATCH | `/admin/support-tickets/:id` | Admin | Update ticket status / note |
| GET | `/admin/contact-inquiries` | Admin | Public contact form submissions |
| PATCH | `/admin/contact-inquiries/:id` | Admin | Update inquiry status / note |
| GET | `/admin/career-applications` | Admin | Public careers form submissions |
| PATCH | `/admin/career-applications/:id` | Admin | Update application status / note |

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
│   ├── inquiries/     POST /contact + /careers
│   └── admin/
└── utils/
sql/
└── schema.sql   # full DB schema (run once in Supabase SQL Editor)
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
update public.users set role = 'admin', is_super_admin = true where email = 'your-email@example.com';
```

## Documentation

- Agent & architecture rules: `AGENTS.md`
- Monorepo overview: `../AGENTS.md`

### Keep this README updated

Update this file in the **same change** when you add or modify routes, env vars, SQL migrations, auth/payment flow, or project structure.
