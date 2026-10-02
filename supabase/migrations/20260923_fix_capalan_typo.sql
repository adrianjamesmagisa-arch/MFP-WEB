-- Fix Capalan City typo to Calapan City
-- This corrects a data entry error where "Capalan City" should be "Calapan City"

UPDATE sbfp_data
SET 
  sdo = 'Calapan City - PM',
  region = 'IV-B'
WHERE id = 'd0daa1fc-edc2-4df9-9d29-ccb7cc1732bb'
  AND sdo = 'Capalan City - PM';

-- Verify the fix
SELECT id, center, sdo, region, created_at
FROM sbfp_data
WHERE id = 'd0daa1fc-edc2-4df9-9d29-ccb7cc1732bb';
