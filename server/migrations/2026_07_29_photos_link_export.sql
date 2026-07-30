-- Photos page Public Link export feature.
-- Already applied directly via the Supabase SQL editor; this file documents
-- the schema for repo history, matching the existing Photos PDF export
-- migration's pattern. Additive only: does not modify any existing columns,
-- tables, or data. RLS is intentionally NOT configured here (deferred by
-- product decision, same as photo_pdf_exports).

-- Snapshot of every active {waypoint_id, photo_id} pair for a project +
-- capture method (across all dates) at the moment a Public Link is created.
-- Opaque token only — the full public URL is built at request time and is
-- never stored. content_hash lets duplicate content reuse the same token
-- instead of creating a new row.
CREATE TABLE IF NOT EXISTS public.photos_link_export (
  export_id uuid NOT NULL DEFAULT gen_random_uuid(),
  token text NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  drawing_id uuid NULL,
  capture_method text NOT NULL,
  included_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_hash text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT photos_link_export_pkey PRIMARY KEY (export_id),
  CONSTRAINT photos_link_export_capture_method_check CHECK (
    (capture_method = ANY (ARRAY['drone'::text, '360_camera'::text]))
  ),
  CONSTRAINT photos_link_export_drawing_required_for_360_check CHECK (
    (capture_method <> '360_camera'::text) OR (drawing_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS photos_link_export_token_uidx
  ON public.photos_link_export (token);

CREATE UNIQUE INDEX IF NOT EXISTS photos_link_export_content_hash_uidx
  ON public.photos_link_export (content_hash);

CREATE INDEX IF NOT EXISTS photos_link_export_project_id_idx
  ON public.photos_link_export (project_id);

CREATE INDEX IF NOT EXISTS photos_link_export_user_id_idx
  ON public.photos_link_export (user_id);

CREATE INDEX IF NOT EXISTS photos_link_export_created_at_idx
  ON public.photos_link_export (created_at DESC);
