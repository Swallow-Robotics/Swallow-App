# Dev Setup (Supabase + R2)

- **Backend**: No local database. All metadata is in **Supabase** (via Supabase client REST API); files in **R2**. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and R2 env vars in `server/.env.local`.
- **Supabase migrations**: Apply via Supabase dashboard or CLI (e.g. `supabase/migrations/`).
- **Foldering (R2)**: `projects/<project_id>/photos/<photo_id>.<ext>` (thumbnails `_thumb`).
- **RLS**: Owners/Administrators full, Editors upload+read, Viewers read-only.
- **Public links**: GET/POST/DELETE under `/api/v1/projects/:id/public-links`; public views `/api/v1/public/<token>/...` with expiry respected.
- **Frontend scoping**: Active project required; Map/Gallery fetch `/api/v1/photos?project_id=<id>`.
- **Project switching**: Use the switcher on the Map page; roles stored in AuthContext.
- **Run backend**: `cd server && python app.py` (or `flask run --port 5001`).
- **Run frontend**: `cd client && yarn start` (uses `.env.local`) or `yarn start:local` (always uses `http://localhost:5001` for the API).
- **Run both**: `./scripts/start-dev.sh` (starts backend in background, frontend in foreground; frontend uses local API; Ctrl+C stops both).

