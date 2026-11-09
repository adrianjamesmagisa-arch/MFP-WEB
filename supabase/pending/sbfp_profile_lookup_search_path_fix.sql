-- Corrective SQL applied to MFP-PCC-WEB production with explicit user approval.
-- Verified both lookups execute; function ownership/grants and RLS policies were unchanged.
-- Applied directly through the management query API; not registered in the CLI migration ledger.
-- Fix: financial triggers use search_path='', while the existing RLS helpers
-- referenced an unqualified profiles table. Qualify that reference and pin each
-- helper's own search path. Keep its existing SECURITY DEFINER behavior, owner,
-- execute grants, return type, current-user lookup and all RLS policies unchanged.
-- No school/MFP data writes, backfill, record creation, or policy changes.
-- Verified on a disposable PostgreSQL fixture with the inspected helper bodies.
-- Promote with `supabase migration new sbfp_profile_lookup_search_path_fix` when CLI is available.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc p
      WHERE p.oid IN (to_regprocedure('public.get_my_role()'), to_regprocedure('public.get_my_center()'))
        AND p.prosecdef AND p.prokind = 'f' AND p.prorettype = 'text'::regtype
        AND p.provolatile = 's') <> 2 THEN
    RAISE EXCEPTION 'Expected the existing stable SECURITY DEFINER text profile helpers. Inspect schema before applying this correction.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role::TEXT FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_center()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT center FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

COMMIT;

-- Verify both functions have search_path configured and public.profiles in their bodies:
-- SELECT proname, proconfig, pg_get_functiondef(oid) FROM pg_proc
-- WHERE oid IN ('public.get_my_role()'::regprocedure,'public.get_my_center()'::regprocedure);
-- Then retry Add school through the signed-in application.
-- If execution fails, ROLLBACK. For recovery after commit, restore the previously
-- reviewed function definitions in a corrective migration; no data recovery is needed.
