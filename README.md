# MyTibangaPortal — Barangay Document & Profiling System

A web-based system for **Barangay Tibanga, Iligan City** that supports resident profiling, barangay document requests, payments (recording), and an admin workflow. Built as a thesis project using **Next.js** (full-stack JavaScript) and **PostgreSQL**.

---

## Features (overview)

### Public / resident portal
- **Homepage** — Editable content from the database; announcements feed
- **Document request** — Catalog and fees from the API; cart and payment step (**cash**, **GCash**, **bank transfer**); optional **receipt upload** and reference capture (including OCR-assisted hints)
- **Track requests** — Status timeline, **My Requests** for logged-in residents; residents may remove **expired** entries from their history
- **Profile** — Edit info, password, profile picture
- **Authentication** — JWT session in HTTP-only cookies ([jose](https://github.com/panva/jose)); passwords hashed with [bcryptjs](https://www.npmjs.com/package/bcryptjs)

### Admin panel
- **Dashboard** — Request queue: notify, validate/approve, for release, complete; OR numbers; **print** flows tied to document templates
- **Resident records** — Add/edit/archive/restore; household hints; linked family data where configured
- **Document management** — Templates and previews (storage-backed where configured)
- **Request history** — Filtered archive view
- **Reports** — KPIs and charts; **export chart (PNG)** and **export data (CSV)** for meetings
- **System settings** — Fees, puroks, announcements, admin users/permissions, payment destinations, **GCash QR image** upload, request expiry settings
- **Edit homepage** — Admin-managed landing content
- **Optional: face recognition** — Camera-based admin login when enabled and enrolled ([face-api.js](https://github.com/justadudewhohacks/face-api.js))

### Operations & security (high level)
- **Middleware** — Protects resident flows and admin routes
- **Admin APIs** — `requireAdmin()` / `requireAuth()` on sensitive routes
- **Request lifecycle** — Pending requests can **expire** per settings; a **cron** endpoint can enforce expiry and long-term cleanup (protect with `CRON_SECRET`)
- **File storage** — **Supabase Storage** for uploads (e.g. templates, receipts, QR, profile assets) when `SUPABASE_*` env vars are set
- **Production** — Deploy on **Vercel** (or similar); database on **Supabase PostgreSQL** or any Postgres with SSL as needed

---

## Tech stack

| Layer | Technology |
|--------|------------|
| App framework | [Next.js 16](https://nextjs.org/) (App Router) |
| UI | React 19, CSS Modules |
| API | Next.js Route Handlers (`app/api/...`) |
| Auth | JWT in HTTP-only cookies ([jose](https://github.com/panva/jose)) |
| Database | [PostgreSQL](https://www.postgresql.org/) via [pg](https://node-postgres.com/) |
| Cloud DB / storage | [Supabase](https://supabase.com/) (Postgres + Storage) — optional locally, typical in production |
| Charts / export | [Recharts](https://recharts.org/), [html-to-image](https://github.com/bubkoo/html-to-image) |
| OCR (receipt hints) | [Tesseract.js](https://github.com/naptha/tesseract.js) |
| Document tooling | [mammoth](https://www.npmjs.com/package/mammoth), [pdf-lib](https://github.com/Hopding/pdf-lib), [libreoffice-convert](https://www.npmjs.com/package/libreoffice-convert) *(LibreOffice optional on the host for some conversions)* |
| SMS *(optional)* | UniSMS via `UNISMS_API_KEY` |

---

## Repository layout

```
Thesis/
├── README.md                 # This file
├── frontend/                 # Next.js application (run everything from here)
│   ├── app/
│   │   ├── (public)/         # Public pages
│   │   ├── (admin)/          # Admin pages
│   │   └── api/              # REST-style route handlers
│   ├── components/
│   ├── db/
│   │   ├── schema.sql        # Baseline schema (new databases)
│   │   └── *.sql             # Incremental migrations for existing DBs
│   ├── lib/                  # auth, db, storage helpers, etc.
│   ├── hooks/
│   ├── middleware.js
│   ├── data/                 # Legacy / dev JSON (optional seed source)
│   └── public/
```

---

## Prerequisites

- **Node.js** 18+ and npm  
- **PostgreSQL** 14+ (local) *or* **Supabase** connection string for hosted DB  
- **LibreOffice** *(optional)* — some print/conversion paths  
- **Supabase project** *(recommended for production)* — Postgres + Storage bucket for uploads  

---

## Getting started (local)

### 1. Clone and enter the app

```bash
git clone https://github.com/Jubil1/Thesis.git
cd Thesis/frontend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Database

Create a database (example name: `barangay`), then apply the baseline schema:

```bash
psql -U postgres -d barangay -f db/schema.sql
```

If the database does not exist yet:

```sql
CREATE DATABASE barangay;
```

**Upgrading an older database:** run the relevant files from `frontend/db/` (e.g. `add_requests_user_id.sql`, `add_residents_soft_delete.sql`, `add_face_descriptor.sql`, etc.) in an order that matches when features were added. When in doubt, compare your live schema to `schema.sql` and apply only missing pieces.

Optional verification / seed:

```bash
node db/seed.js
```

### 4. Environment variables

Create **`frontend/.env.local`** (never commit real secrets). Example shape:

```env
# Required: PostgreSQL (local or Supabase)
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE

# Strong secret in production (JWT signing)
JWT_SECRET=your-long-random-string

# Used in production for absolute URLs (links, redirects)
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Optional: Supabase Storage (server-side; use service role key — keep private)
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=documents

# Optional: scheduled cleanup (Vercel Cron or external scheduler)
CRON_SECRET=your-cron-shared-secret

# Optional: SMS
UNISMS_API_KEY=your-unisms-key

# Optional: hosted Postgres often needs SSL
# PGSSLMODE=require

# Optional: enable polling in dev
# NEXT_PUBLIC_ENABLE_DEV_POLLING=1
```

For **Supabase** pooled or direct connections, use the connection string from the Supabase dashboard and set `PGSSLMODE=require` if required by your client/network.

### 5. Run the dev server

```bash
npm run dev
```

Open **http://localhost:3000**.

**Access from other devices on the same LAN** (e.g. phone on Wi‑Fi):

```bash
npx next dev -H 0.0.0.0 -p 3000
```

Then browse `http://<your-PC-LAN-IP>:3000` and allow the port in the OS firewall if needed.

### 6. Production build (local smoke test)

```bash
npm run build
npm start
```

---

## Deployment (Vercel + Supabase)

Typical flow:

1. Push the repo to **GitHub** (or Git provider supported by Vercel).  
2. **Import** the project in Vercel; set the **root directory** to `frontend` if the monorepo root is `Thesis/`.  
3. In Vercel **Environment Variables**, set at least `DATABASE_URL`, `JWT_SECRET`, `NEXT_PUBLIC_BASE_URL` (your production URL), and any `SUPABASE_*` / `CRON_SECRET` / `UNISMS_API_KEY` you use.  
4. Deploy. Vercel runs `next build` and serves the app over HTTPS.  

Configure a **Cron** job (Vercel Cron or external) to call your cleanup route (e.g. `/api/cron/cleanup-expired-requests`) on a schedule, with the same `CRON_SECRET` the route expects.

Payment behavior is **recording** (method, reference, receipt image): the app does **not** process GCash/bank payments inside the system.

---

## Request statuses (typical flow)

| Status | Meaning (UI) |
|--------|----------------|
| `pending` | Submitted; admin may notify or move forward |
| `approved` | Validation stage |
| `for_release` | Ready for pickup/release |
| `completed` | Done |
| `expired` | Not completed in time (per settings); may be cleaned up or hidden per policy |
| `rejected` / `declined` | Ended with reason (where used) |

---

## Default / seed accounts

After seeding (or manual DB setup), use the credentials your seed defines. Change all default passwords before any public deployment.

---

## License

Academic thesis project — not intended for commercial licensing without permission from the author and institution.
