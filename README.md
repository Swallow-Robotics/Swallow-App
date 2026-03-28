# Swallow Skyer

Swallow Skyer is a photo mapping platform: users upload photos, the backend extracts GPS/EXIF metadata, and the frontend renders photos on an interactive MapLibre map.

## Repository layout

```
client/   # React frontend source (build output goes to client/build/)
server/   # Flask backend source (API, storage clients, auth middleware)
docs/     # Architecture, API, and data-flow docs
scripts/  # Local automation scripts (setup/tests; not deployment targets)
```

## Quick start (local development)

### Prerequisites

- **Node.js** 18+
- **Yarn** 1.22+ (`npm install -g yarn`)
- **Python** 3.8+

### 1) Clone and configure environment

```bash
git clone https://github.com/Swallow-Robotics/Swallow-App.git
cd Swallow-App
```

The project uses two `.env` files — one for the backend (`server/`) and one for the frontend (`client/`). Example templates are provided for both.

#### Backend env (`server/`)

```bash
cd server
cp .env.example .env
```

Edit `server/.env` with your credentials:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Supabase anon/public key (used for JWT validation) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only, full database access) |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret access key |
| `R2_BUCKET` | R2 bucket name for image storage |
| `R2_PUBLIC_BASE_URL` | Public URL for the R2 bucket (used to serve images to the frontend) |

#### Frontend env (`client/`)

```bash
cd client
cp env.example .env.local
```

Edit `client/.env.local` with your values:

| Variable | Description |
|---|---|
| `REACT_APP_SUPABASE_URL` | Same Supabase project URL as above |
| `REACT_APP_SUPABASE_ANON_KEY` | Same Supabase anon key as above |
| `REACT_APP_API_BASE_URL` | Backend API URL — use `http://localhost:5001` for local dev |
| `REACT_APP_R2_PUBLIC_BASE_URL` | Public R2 URL (optional, for loading images directly from R2) |

All `REACT_APP_*` variables are baked into the frontend at build time. If you change them, restart the dev server.

> **Tip**: If you skip creating `client/.env.local`, the `yarn start` script will auto-create one from `env.example` — but you'll still need to fill in real values.

### 2) Backend (Flask API)

```bash
python3 -m venv venv
source venv/bin/activate

cd server
pip install -r requirements.txt
python app.py
```

The API starts on `http://localhost:5001` (or the value of `PORT` if set).

### 3) Frontend (React)

```bash
cd client
yarn install
yarn start           # Uses API URL from .env.local
yarn start:local     # Forces local backend (http://localhost:5001)
```

Frontend dev server: `http://localhost:3000`

### 4) Run tests

```bash
# Frontend
cd client
yarn test

# Backend
cd server
pytest
```

### 5) Lint

```bash
cd client
yarn lint            # Check for issues
yarn lint:fix        # Auto-fix issues
```

## Deployment architecture (production)

- **Frontend**: React static site on **GitHub Pages** (build output only)
- **Backend**: Flask API on **Render**
- **Auth**: Supabase Auth (frontend uses Supabase JS; backend validates JWTs)
- **Database**: Supabase Postgres (backend uses service role credentials)
- **File storage**: Cloudflare R2 (S3-compatible) for images + thumbnails

Frontend and backend are deployed independently.

### Frontend build and deploy (GitHub Pages)

```bash
cd client
yarn install --frozen-lockfile
yarn build
```

Deploy **only** `client/build/` to GitHub Pages. All `REACT_APP_*` env vars must be set at build time (they are baked into the static bundle).

Build-time env vars:

- `REACT_APP_API_BASE_URL=https://swallow-skyer-v1.onrender.com`
- `REACT_APP_SUPABASE_URL=<your supabase url>`
- `REACT_APP_SUPABASE_ANON_KEY=<your anon key>`

**RECOMMENDED**: Use the automated deployment script:

```bash
./scripts/deploy-frontend.sh
```

### Backend deploy (Render)

Push to `main` — Render deploys automatically.

Recommended start command:

```bash
python -m gunicorn "app:create_app()" --bind 0.0.0.0:$PORT
```

Required env vars:

- `APP_ENV=production`
- `SECRET_KEY=<random>`
- `FRONTEND_ORIGIN=https://chris-roberts-2.github.io`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- `R2_ACCOUNT_ID` (or `R2_ENDPOINT_URL`), `R2_PUBLIC_BASE_URL`
- `AUTH_ACCESS_SECRET`, `AUTH_REFRESH_SECRET`
- `AUTH_JWT_ALGORITHM=HS256`
- `AUTH_ACCESS_TTL_SECONDS=900`, `AUTH_REFRESH_TTL_SECONDS=1209600`

## API quick reference

- **Health**: `GET /api/health`
- **Photos (v1)**:
  - `GET /api/v1/photos/?project_id=<uuid>`
  - `POST /api/v1/photos/upload`
- **Upload (compat)**: `POST /api/photos/upload`
