# ODI Backend

TypeScript Express API for the ODI Kids storefront and dashboards.

| Concern | Stack |
| --- | --- |
| Auth | Firebase (Google + email). Clients send `Authorization: Bearer <idToken>`. |
| Database | Supabase Postgres via **service-role** key. RLS blocks direct browser access. |
| Payments | Razorpay (test or live). Paid status via signed webhook and/or client verify. |
| Shipping | Delhivery Express (staging by default; production when configured). |
| Email | Gmail SMTP — welcome, order, ship, deliver, cancel, refund, product-live, support. |

> **API surface:** Do **not** publish route catalogs in this README (it ships with the backend). Full request/response docs for the team live only in the monorepo root [`../api.md`](../api.md). Keep that file private to the repo; never deploy it to the API host.

## Setup

```bash
npm install
copy .env.example .env   # fill Supabase + Firebase + Razorpay + SMTP_PASS
npm run dev              # http://localhost:5000
```

Public health check: `GET /health` (ok to probe in production).

### Email (Gmail)

1. Google account for store mail (see `.env.example` `MAIL_FROM` / `SMTP_USER`).
2. Enable **2-Step Verification**, create an **App password**.
3. Set `MAIL_FROM`, `SMTP_USER`, `SMTP_PASS`, and `FRONTEND_URL` (local site or production site).

Logo and social icon URLs for email HTML live in `src/lib/mailer/brand.ts` (public brand assets). Do not put those URLs in `.env`.

Without `SMTP_PASS`, the API still runs and logs outbound mail to the console.

### Firebase (permanent customer delete)

Token verify only needs `FIREBASE_PROJECT_ID`. To delete a customer so they cannot sign in again:

1. [Firebase Console](https://console.firebase.google.com/) → Project settings → **Service accounts** → **Generate new private key**.
2. Save the JSON as `odi-backend/firebase-service-account.json` (gitignored).
3. In `.env`: `FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json`
4. Restart the API.

Admin **Customers → Delete** then removes Firebase login and the Supabase row (or bans the row if they have orders).

### Delhivery (shipping)

`.env` has **two credential groups**. Keep exactly one active:

| Block | Account | Host | Notes |
|-------|---------|------|--------|
| **STAGING** (default local) | B2B JWT | staging Express host | No production wallet required |
| **PRODUCTION** | B2C | production track host | Wallet required for AWB |

**Switch:** comment the whole active block, uncomment the other. Do not mix staging warehouse with production token.

Copy the variable names from `.env.example` (tokens, pickup name, origin PIN, warehouse address, `DELHIVERY_LABEL_PDF_SIZE=4R`).

After changing `.env`, restart `npm run dev`. Boot log should show staging or production with the expected pickup name.

Admin **Shipments** can retry create / request pickup against the active env. Register the warehouse in Delhivery One for the same env/token the API uses.

Quick local smoke (no auth): pin-code, TAT, and charges under `/shipping/…` — see source routes in `src/modules/shipping` if you need paths.

### SQL (run once in Supabase SQL Editor)

Run **`sql/schema.sql`** — single source of truth for users + commerce.

If the DB already exists, also run **`sql/migrate-payment-close-reason.sql`** once (adds `orders.payment_close_reason` for abandoned unpaid online checkouts).

For checkout coupon offers, run **`sql/migrate-coupon-offers.sql`** once (`coupons.is_public` / title / description + `coupon_products`).

**Warning:** re-running drops and recreates commerce tables. Safe on empty projects only. Do not re-run on a live DB with data.

**Existing databases:**

- **`sql/stock-functions.sql`** — `CREATE OR REPLACE` (safe). Needed for atomic stock at checkout.
- **`sql/legal-pages.sql`** — legal company + pages seed (safe to re-run).

After first sign-in, promote yourself:

```sql
update public.users set role = 'admin', is_super_admin = true where email = 'you@example.com';
```

Add catalog via **Admin → Products**. Optional coupons can be inserted in SQL.

### Product images

1. Create a public Storage bucket named `product-images` (or set `SUPABASE_STORAGE_BUCKET`).
2. Upload via **Admin → Products** or the Supabase Dashboard ([Storage](https://supabase.com/dashboard)).
3. Each product: one **card** image + up to **5 gallery** images.
4. Checkout copy fields (`long_description`, author/publisher bios, etc.) are columns in `sql/schema.sql`.

## Auth (overview)

```
User signs in with Firebase (frontend)
  → ID token
  → Backend verifies token and upserts Supabase profile
  → Later calls send the same Bearer token
```

There is no custom access/refresh JWT pair. Firebase refreshes the ID token.

Deleting only the Supabase `users` row is not a full ban: if the Firebase user still exists, sync will recreate the profile. Use admin delete (with service account) or delete the user in Firebase Console → Authentication.

## Payments (overview)

1. Checkout creates a pending order (and a Razorpay order for prepaid).
2. Customer pays in Razorpay Checkout (or COD path skips the gateway).
3. Backend marks paid via **signed webhook** and/or **client verify** (idempotent).
4. Stock, order email, cart clear, and Delhivery shipment run on the paid path (COD reserves earlier).

### Razorpay webhook (production)

Razorpay must call a **public HTTPS** URL. It cannot reach `localhost`. Local QA can still confirm via client verify after the modal.

1. [Razorpay Dashboard](https://dashboard.razorpay.com/) → Test or Live (must match key mode).
2. **Account & Settings → Webhooks → Add New Webhook**.
3. URL: value of `RAZORPAY_WEBHOOK_URL` in `.env` (production must reverse-proxy that path to this API).
4. Paste Razorpay’s webhook **secret** into `RAZORPAY_WEBHOOK_SECRET` (do not invent it).
5. Enable payment / order / refund events your integration needs.
6. Restart the API; send a test event and confirm `200` in logs.

**Refunds:** Razorpay pays refunds from merchant wallet / refund credits (often ₹0 in Test Mode until more test payments settle). Admin “Collected” is ODI DB captured totals, not Razorpay available balance.

## Project structure

```
src/
├── server.ts
├── app.ts                 # mounts modules (source of truth for routes)
├── config/                # env, firebase, supabase
├── lib/                   # razorpay, delhivery, mailer, pagination, …
├── middleware/            # auth, admin, errors
├── modules/               # domain folders (auth, products, checkout, …)
└── utils/
sql/
├── schema.sql
├── legal-pages.sql
└── stock-functions.sql
```

For route names and payloads, read `src/app.ts` / `src/modules/*/routes.ts` or the private monorepo [`../api.md`](../api.md).

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled production build |
| `npm run typecheck` | Type-check without emit |

## Documentation

| Doc | Purpose |
| --- | --- |
| This README | Setup, env, SQL, deploy ops (**no full API catalog**) |
| [`../api.md`](../api.md) | Full API reference for developers (monorepo only) |
| `AGENTS.md` | Backend coding conventions |
| `../AGENTS.md` | Monorepo overview |

### Keep docs updated

- **Routes / request / response changes** → update **`../api.md` only** (not this README’s body).
- **Env vars, SQL, setup, webhook URL, scripts** → update **this README** in the same change.
- Never commit real secrets (`.env`, service-account JSON, live tokens).
