"""
Resolves the frontend origin used to build durable public app links (e.g. the
public photo viewer URL embedded in PDF exports). Never returns a signed R2
URL or anything tied to storage — only the app's own public origin.
"""

import os


def get_public_app_origin(request_url_root: str = "") -> str:
    """
    Preference order:
      1. Local API request → FRONTEND_ORIGIN (or localhost:3000), so local
         PDF / Public Link exports are testable against the local SPA even
         when PUBLIC_APP_ORIGIN points at production.
      2. PUBLIC_APP_ORIGIN — explicit override for production.
      3. First entry of FRONTEND_ORIGIN — already configured for CORS.
      4. The current request's own root — last-resort fallback.
    """
    root = (request_url_root or "").rstrip("/")
    is_local_request = "localhost" in root or "127.0.0.1" in root

    def _first_frontend_origin() -> str:
        frontend_origins = (os.environ.get("FRONTEND_ORIGIN") or "").strip()
        if not frontend_origins:
            return ""
        first = frontend_origins.split(",")[0].strip()
        if not first:
            return ""
        if not first.startswith(("http://", "https://")):
            first = f"https://{first}"
        return first.rstrip("/")

    if is_local_request:
        return _first_frontend_origin() or "http://localhost:3000"

    explicit = (os.environ.get("PUBLIC_APP_ORIGIN") or "").strip()
    if explicit:
        return explicit.rstrip("/")

    frontend = _first_frontend_origin()
    if frontend:
        return frontend

    return root
