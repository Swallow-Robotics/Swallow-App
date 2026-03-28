# Scripts

This directory contains **helper scripts for local development and CI-style checks**. These scripts are not part of the deployed frontend (GitHub Pages) or backend (Render) runtime.

## Structure

- `development/`: local setup + test runners
- `deployment/`: placeholder deployment helpers (frontend build + TODO sections)
- `setup.sh`: one-shot local setup convenience

## Common usage

Initial setup (one-time):

```bash
./scripts/setup.sh
```

**Start both backend and frontend** (single terminal; backend in background, frontend in foreground; Ctrl+C stops both):

```bash
./scripts/start-dev.sh
```

Other helpers:

```bash
./scripts/development/start-dev.sh   # install deps only (then run backend/frontend yourself)
./scripts/development/run-tests.sh  # run all tests
```

Frontend production build (for GitHub Pages):

```bash
cd client
yarn build
```

## Notes

- The deployed frontend is the **static build output** (`client/build/`).
- The deployed backend is the **Flask API** from `server/` (hosted separately on Render).
