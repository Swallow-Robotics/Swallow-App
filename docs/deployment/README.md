# Deployment (Vercel + Render)

Swallow Skyer is deployed as **two separate services**:

- **Frontend**: React static site on **Vercel** (custom domain `https://swallow-ctr.com`)
- **Backend**: Flask API on **Render**

Images are stored in **Cloudflare R2** and metadata/auth live in **Supabase**.

## Frontend (Vercel)

- **Source**: `client/`
- **Deployable artifact**: `client/build/` (generated)
- **Config**: root `vercel.json` (SPA rewrite to `index.html`)

Build command:

```bash
cd client
yarn install --frozen-lockfile
yarn build
```

Environment variables are **build-time** (baked into the static bundle):

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`
- `REACT_APP_API_BASE_URL` (required in production): `https://swallow-app.onrender.com`
- `REACT_APP_R2_PUBLIC_BASE_URL` (optional)

Email confirmation redirects use `window.location.origin`, so they automatically follow the domain the user is on (e.g. `https://swallow-ctr.com/auth/callback`).

## Backend (Render)

- **Source**: `server/`
- **Start command** (honors Render `PORT`):

```bash
cd server
python -m gunicorn "app:create_app()" --bind 0.0.0.0:$PORT
```

Local build/install (Render build step equivalent):

```bash
cd server
pip install -r requirements.txt
```

Required environment variables (Render):

- **App**: `APP_ENV=production`, `PORT`, `SECRET_KEY`
  - `FRONTEND_ORIGIN=https://swallow-ctr.com` (CORS; comma-separate additional origins such as `https://www.swallow-ctr.com` if needed)
  - `PUBLIC_APP_ORIGIN=https://swallow-ctr.com` (durable public links in PDF exports)
- **Supabase**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (all metadata/auth via Supabase; no separate DB URL)
- **R2**: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (or `R2_BUCKET_NAME`)
  - plus `R2_ACCOUNT_ID` or `R2_ENDPOINT_URL`
  - optional `R2_PUBLIC_BASE_URL` (for public URLs when available)
- **Legacy API auth**: `AUTH_ACCESS_SECRET`, `AUTH_REFRESH_SECRET`, `AUTH_JWT_ALGORITHM=HS256`, `AUTH_ACCESS_TTL_SECONDS=900`, `AUTH_REFRESH_TTL_SECONDS=1209600`

## Domain migration checklist

When changing the production frontend domain:

1. **Vercel**: attach the custom domain and confirm HTTPS works
2. **Cloudflare DNS**: point the domain at Vercel
3. **Render**: update `FRONTEND_ORIGIN` and `PUBLIC_APP_ORIGIN`
4. **Supabase Auth**: set Site URL to `https://swallow-ctr.com` and allow redirect URLs including `https://swallow-ctr.com/auth/callback`
5. **R2 CORS**: if the bucket CORS policy lists specific origins, add the new domain

## Verify

- Backend health: `GET /api/health`
- Frontend loads at `https://swallow-ctr.com`
- Browser network requests to the Render API succeed (no CORS errors)
- Signup confirmation email lands on `/auth/callback` on the new domain
