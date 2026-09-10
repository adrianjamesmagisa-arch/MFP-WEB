-- Keep only calendar-year 2026 operational data.
-- Does NOT delete: auth.users, profiles, cooperatives.
-- Run once in Supabase SQL Editor (service role) or via scripts/purge_non_2026_pg.js

BEGIN;

-- Masterlist (includes SBFP + program monitoring sync rows)
DELETE FROM public.mfp_data
WHERE year IS NULL OR year <> 2026;

-- Program monitoring (DSWD / LDS / LGU / Others)
DELETE FROM public.mfp_program_dropoffs
WHERE year IS NULL OR year <> 2026;

DELETE FROM public.mfp_program_procurement
WHERE year IS NULL OR year <> 2026;

DELETE FROM public.mfp_program_months
WHERE year IS NULL OR year <> 2026;

-- SBFP
DELETE FROM public.sbfp_dropoff_points
WHERE year IS NULL OR year <> 2026;

DELETE FROM public.sbfp_data
WHERE year IS NULL OR year <> 2026;

DELETE FROM public.sbfp_monitoring
WHERE year IS NULL OR year <> 2026;

DELETE FROM public.sbfp_activities
WHERE year IS NULL OR year <> 2026;

DELETE FROM public.sbfp_summary
WHERE year IS NULL OR year <> 2026;

DELETE FROM public.sbfp_budget
WHERE year IS NULL OR year <> 2026;

DELETE FROM public.sbfp_ppmp_items
WHERE year IS NULL OR year <> 2026;

DELETE FROM public.sbfp_staff_hiring
WHERE year IS NULL OR year <> 2026;

DELETE FROM public.sbfp_school_years
WHERE year IS NULL OR year <> 2026;

COMMIT;
