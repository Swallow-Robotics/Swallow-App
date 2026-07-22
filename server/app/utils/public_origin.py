"""
Resolves the frontend origin used to build durable public app links (e.g. the
public photo viewer URL embedded in PDF exports). Never returns a signed R2
URL or anything tied to storage — only the app's own public origin.
"""

import os


def get_public_app_origin(request_url_root: str = "") -> str:
    """
    Preference order:
      1. PUBLIC_APP_ORIGIN — explicit override, recommended for production.
      2. First entry of FRONTEND_ORIGIN — already configured for CORS.
      3. The current request's own root — local dev fallback only.
    """
    explicit = (os.environ.get("PUBLIC_APP_ORIGIN") or "").strip()
    if explicit:
        return explicit.rstrip("/")

    frontend_origins = (os.environ.get("FRONTEND_ORIGIN") or "").strip()
    if frontend_origins:
        first = frontend_origins.split(",")[0].strip()
        if first:
            if not first.startswith(("http://", "https://")):
                first = f"https://{first}"
            return first.rstrip("/")

    return (request_url_root or "").rstrip("/")
