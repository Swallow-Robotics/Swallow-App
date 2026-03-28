# Swallow Skyer

## Summary

- **Frontend**: React on GitHub Pages
- **Backend**: Flask API on Render
- **Auth + metadata**: Supabase
- **Photo files**: Cloudflare R2

## Index

| Doc | Description |
|-----|--------------|
| [setup_guide.md](setup_guide.md) | Full setup (backend, frontend, env, deploy) |
| [dev-setup.md](dev-setup.md) | Short dev checklist (Supabase, R2, run commands) |
| [architecture.md](architecture.md) | Stack, components, data models |
| [api_endpoints.md](api_endpoints.md) | API reference |
| [authentication.md](authentication.md) | Auth flow (Supabase, JWT, backend) |
| [auth_security_review.md](auth_security_review.md) | Security checklist |
| [deployment/README.md](deployment/README.md) | Deploy (GitHub Pages + Render) |
| [testing_coverage.md](testing_coverage.md) | Tests and coverage |
| [user-guide/README.md](user-guide/README.md) | End-user workflows |

## Quick commands

**Backend:** `cd server && source ../venv/bin/activate && python app.py`  
**Frontend:** `cd client && yarn start` (or `yarn start:local` for local API)
