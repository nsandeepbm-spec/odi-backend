# ODI Backend

TypeScript Express API for the ODI booking platform.

- **Auth:** Firebase Authentication (Google + email/password). Frontend sends `Authorization: Bearer <idToken>`.
- **Database:** Supabase (Postgres) via service-role key. RLS blocks direct client access.

## Setup

```bash
npm install
copy .env.example .env   # fill Supabase + Firebase values
npm run dev              # http://localhost:5000
```

Run `sql/001_create_users.sql` in the Supabase SQL editor first.

## API routes

| Method | Route        | Auth   | Description |
| ------ | ------------ | ------ | ----------- |
| GET    | `/health`    | —      | Health check |
| POST   | `/auth/sync` | Bearer | Sync Firebase user → Supabase profile |
| GET    | `/user/me`   | Bearer | Current user profile |
| PATCH  | `/user/me`   | Bearer | Update own profile |
| GET    | `/users`     | Admin  | List all users (`?page=1&perPage=20`) |

Response shape: `{ success, data }` or `{ success: false, error: { message } }`.

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

## Project structure

```
src/
├── server.ts
├── app.ts
├── types.ts
├── config/          env, firebase-admin, supabase
├── middleware/      authenticate, loadUser, requireAdmin, errors
├── modules/
│   ├── auth/        POST /auth/sync
│   ├── user/        GET/PATCH /user/me
│   └── users/       GET /users (admin), users.service
└── utils/
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
