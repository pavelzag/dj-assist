\set ON_ERROR_STOP on

BEGIN;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY client_id, file_hash
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.tracks
  WHERE COALESCE(BTRIM(client_id), '') <> ''
    AND COALESCE(BTRIM(file_hash), '') <> ''
),
deleted AS (
  DELETE FROM public.tracks t
  USING ranked r
  WHERE t.id = r.id
    AND r.rn > 1
  RETURNING t.id
)
SELECT COUNT(*) AS deleted_duplicate_rows FROM deleted;

CREATE UNIQUE INDEX IF NOT EXISTS tracks_client_file_hash_uq
ON public.tracks (client_id, file_hash)
WHERE COALESCE(BTRIM(file_hash), '') <> '';

COMMIT;
