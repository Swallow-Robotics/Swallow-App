"""Retry helper for transient Supabase/HTTP client errors."""


def execute_with_retry(fn, attempts: int = 3):
    """Retry a Supabase query on transient network errors (e.g. Errno 35)."""
    last_exc = None
    for _ in range(attempts):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
    raise last_exc
