-- Photos Export date-filter upgrade — required before PDF Export works.
-- Run manually in the Supabase SQL editor.
--
-- Assumes public.photos_pdf_export already exists (renamed from the old
-- photo_pdf_exports name) with photos_pdf_export_* constraint/index names.
-- Replaces single-day selected_date with date_mode + selected_dates, and
-- adds content_hash + link_export_id for Public Link reuse.
-- photos_link_export is unchanged.

ALTER TABLE public.photos_pdf_export
  ADD COLUMN IF NOT EXISTS date_mode text,
  ADD COLUMN IF NOT EXISTS selected_dates text[] NOT NULL DEFAULT '{}';

UPDATE public.photos_pdf_export
SET date_mode = 'single',
    selected_dates = ARRAY[selected_date]
WHERE date_mode IS NULL
  AND selected_date IS NOT NULL;

UPDATE public.photos_pdf_export
SET date_mode = 'all'
WHERE date_mode IS NULL;

ALTER TABLE public.photos_pdf_export
  ALTER COLUMN date_mode SET NOT NULL,
  ALTER COLUMN date_mode SET DEFAULT 'all';

ALTER TABLE public.photos_pdf_export
  DROP CONSTRAINT IF EXISTS photos_pdf_export_selected_date_check;

ALTER TABLE public.photos_pdf_export
  DROP COLUMN IF EXISTS selected_date;

ALTER TABLE public.photos_pdf_export
  DROP CONSTRAINT IF EXISTS photos_pdf_export_date_mode_check;

ALTER TABLE public.photos_pdf_export
  ADD CONSTRAINT photos_pdf_export_date_mode_check
    CHECK (date_mode IN ('all', 'single', 'custom'));

ALTER TABLE public.photos_pdf_export
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS link_export_id uuid REFERENCES public.photos_link_export (export_id);

CREATE UNIQUE INDEX IF NOT EXISTS photos_pdf_export_content_hash_uidx
  ON public.photos_pdf_export (content_hash)
  WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS photos_pdf_export_link_export_id_idx
  ON public.photos_pdf_export (link_export_id);
