-- Delete the duplicate Calapan City entry (the one that was originally the Capalan typo)
-- This entry has no region set and is a duplicate of the correct Calapan City entry

DELETE FROM sbfp_data
WHERE id = 'd0daa1fc-edc2-4df9-9d29-ccb7cc1732bb'
  AND sdo = 'Calapan City - PM'
  AND center = 'UPLB'
  AND (region IS NULL OR region = '');

-- Verify there's only one Calapan City left
SELECT id, center, sdo, region, created_at
FROM sbfp_data
WHERE year = 2026
  AND sdo ILIKE '%Calapan%'
ORDER BY created_at;
