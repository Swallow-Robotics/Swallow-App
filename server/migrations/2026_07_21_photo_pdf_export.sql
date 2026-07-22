-- Photos PDF Export feature — run manually in the Supabase SQL editor.
-- Additive only: does not modify any existing columns, tables, or data.
-- RLS is intentionally NOT configured here (deferred by product decision).

-- 1) Stable opaque token for the public (unauthenticated) photo viewer.
--    The full public URL is built at request/export time; never store a URL.
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS public_token text;

CREATE UNIQUE INDEX IF NOT EXISTS photos_public_token_uidx
  ON public.photos (public_token)
  WHERE public_token IS NOT NULL;

-- 2) Backfill tokens for existing active photos only. Inactive/soft-deleted
--    photos are intentionally left without a token so they can never resolve
--    on the public viewer.
UPDATE public.photos
SET public_token = replace(gen_random_uuid()::text, '-', '')
WHERE active_photo = true
  AND public_token IS NULL;

-- 3) Audit table for generated Photos PDF exports.
CREATE TABLE IF NOT EXISTS public.photo_pdf_exports (
  export_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  drawing_id uuid NOT NULL,
  selected_date text NOT NULL,
  capture_method text NOT NULL,
  r2_path text NOT NULL,
  r2_url text,
  included_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT photo_pdf_exports_capture_method_check
    CHECK (capture_method IN ('drone', '360_camera')),
  CONSTRAINT photo_pdf_exports_selected_date_check
    CHECK (selected_date ~ '^\d{4}-\d{2}-\d{2}$')
);

CREATE INDEX IF NOT EXISTS photo_pdf_exports_project_id_idx
  ON public.photo_pdf_exports (project_id);

CREATE INDEX IF NOT EXISTS photo_pdf_exports_user_id_idx
  ON public.photo_pdf_exports (user_id);

CREATE INDEX IF NOT EXISTS photo_pdf_exports_created_at_idx
  ON public.photo_pdf_exports (created_at DESC);
