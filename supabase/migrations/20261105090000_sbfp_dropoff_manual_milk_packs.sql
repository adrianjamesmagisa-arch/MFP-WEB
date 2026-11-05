-- Persist the encoder-entered milk-pack count for each SBFP drop-off school.
-- Preserve current calculated values once during migration; later edits are manual.

ALTER TABLE public.sbfp_dropoff_points
  ADD COLUMN milk_packs INTEGER;

WITH resolved_days AS (
  SELECT
    d.id,
    COALESCE(
      NULLIF(d.feeding_days, 0),
      NULLIF(p.feeding_days, 0),
      NULLIF((regexp_match(COALESCE(p.sdo, ''), '(\d+)\s*Feeding\s*Days?', 'i'))[1]::INTEGER, 0),
      NULLIF((regexp_match(COALESCE(p.remarks, ''), '(\d+)\s*Feeding\s*Days?', 'i'))[1]::INTEGER, 0),
      NULLIF((regexp_match(COALESCE(d.sdo, ''), '(\d+)\s*Feeding\s*Days?', 'i'))[1]::INTEGER, 0),
      NULLIF((regexp_match(COALESCE(d.remarks, ''), '(\d+)\s*Feeding\s*Days?', 'i'))[1]::INTEGER, 0),
      0
    ) AS feeding_days
  FROM public.sbfp_dropoff_points AS d
  LEFT JOIN public.sbfp_data AS p ON p.id = d.sbfp_data_id
)
UPDATE public.sbfp_dropoff_points AS d
SET milk_packs = GREATEST(
  0::BIGINT,
  COALESCE(d.beneficiaries, 0)::BIGINT * COALESCE(r.feeding_days, 0)::BIGINT
)::INTEGER
FROM resolved_days AS r
WHERE r.id = d.id
  AND d.milk_packs IS NULL;

UPDATE public.sbfp_dropoff_points
SET milk_packs = 0
WHERE milk_packs IS NULL;

ALTER TABLE public.sbfp_dropoff_points
  ALTER COLUMN milk_packs SET DEFAULT 0,
  ALTER COLUMN milk_packs SET NOT NULL;

ALTER TABLE public.sbfp_dropoff_points
  ADD CONSTRAINT sbfp_dropoff_points_milk_packs_nonnegative CHECK (milk_packs >= 0);
