-- Fix Supabase Advisor CRITICAL: Security Definer Views
-- App does not query these view names; keep them for SQL/manual use but
-- run as invoker so RLS of the calling role applies (Postgres 15+).

DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'summary_lds',
    'summary_deped_sbfp',
    'summary_dswd_sfp',
    'beneficiaries_by_region_year'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v
        AND c.relkind = 'v'
    ) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
      RAISE NOTICE 'Set security_invoker=true on public.%', v;
    ELSE
      RAISE NOTICE 'View public.% not found — skipped', v;
    END IF;
  END LOOP;
END $$;
