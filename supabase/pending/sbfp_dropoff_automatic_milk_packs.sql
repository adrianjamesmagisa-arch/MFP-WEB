-- Applied to MFP-PCC-WEB production after explicit user approval.
-- Verified zero school-pack, linked MFP count, financial, and formulation mismatches.
-- Recalculated 23 school pack totals; source inputs/fees, membership, and RLS were unchanged.
-- Applied through the management query API; not registered in the CLI migration ledger.
-- Requires automatic finances and the profile lookup correction to be installed first.
-- Milk packs become beneficiaries × the school's own feeding_days (zero stays zero).
-- Recalculates existing school packs and linked MFP counts, formulas, and milk costs.
-- Preserves shipping fees, source inputs, permissions, policies, and all record membership.
-- Export affected school/MFP derived values before production execution for recovery.
-- Promote with `supabase migration new sbfp_dropoff_automatic_milk_packs` when CLI is available.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF to_regprocedure('public.guard_sbfp_school_finance()') IS NULL
    OR to_regprocedure('public.sync_sbfp_school_finance()') IS NULL
    OR to_regprocedure('public.sbfp_school_pack_price(text,numeric,text,text)') IS NULL
    OR to_regprocedure('public.sbfp_school_milk_cost(integer,numeric)') IS NULL
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='sbfp_dropoff_points' AND column_name='contract_unit_price' AND data_type='numeric')
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.sbfp_dropoff_points'::regclass
      AND tgname='sbfp_school_finance_guard' AND tgfoid=to_regprocedure('public.guard_sbfp_school_finance()')
      AND tgenabled IN ('O','A'))
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.mfp_data'::regclass
      AND tgname='mfp_use_sbfp_school_finance' AND tgfoid=to_regprocedure('public.use_sbfp_school_finance()')
      AND tgenabled IN ('O','A')) THEN
    RAISE EXCEPTION 'Apply automatic school finances before automatic packs.';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE oid IN (to_regprocedure('public.get_my_role()'),to_regprocedure('public.get_my_center()'))
      AND 'search_path=""'=ANY(coalesce(proconfig,ARRAY[]::TEXT[]))
      AND lower(pg_get_functiondef(oid)) LIKE '%public.profiles%') <> 2 THEN
    RAISE EXCEPTION 'Apply the profile lookup search-path correction before automatic packs.';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
      AND table_name='sbfp_dropoff_points' AND column_name IN ('beneficiaries','feeding_days','milk_packs')
      AND data_type='integer' AND is_nullable='NO') <> 3 THEN
    RAISE EXCEPTION 'Expected non-null integer school beneficiaries, feeding_days and milk_packs; inspect schema first.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sbfp_dropoff_points WHERE beneficiaries<0 OR feeding_days<0
      OR beneficiaries::BIGINT * feeding_days::BIGINT > 2147483647) THEN
    RAISE EXCEPTION 'Resolve negative or overflowing school inputs before recalculating packs.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sbfp_school_calculated_packs(beneficiaries INTEGER, feeding_days INTEGER)
RETURNS INTEGER LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE packs BIGINT;
BEGIN
  IF coalesce(beneficiaries,0)<0 OR coalesce(feeding_days,0)<0 THEN
    RAISE EXCEPTION 'Beneficiaries and feeding days must be nonnegative whole numbers.' USING ERRCODE='22003';
  END IF;
  packs := coalesce(beneficiaries,0)::BIGINT * coalesce(feeding_days,0)::BIGINT;
  IF packs > 2147483647 THEN
    RAISE EXCEPTION 'Beneficiaries times feeding days must not exceed 2147483647 packs.' USING ERRCODE='22003';
  END IF;
  RETURN packs::INTEGER;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_sbfp_school_packs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  NEW.milk_packs := public.sbfp_school_calculated_packs(NEW.beneficiaries,NEW.feeding_days);
  RETURN NEW;
END;
$$;

-- Alphabetical trigger order is intentional: automatic packs run BEFORE finance_guard.
-- All writes recalculate, including legacy clients trying to submit manual milk_packs.
CREATE OR REPLACE TRIGGER sbfp_school_automatic_packs
BEFORE INSERT OR UPDATE ON public.sbfp_dropoff_points
FOR EACH ROW EXECUTE FUNCTION public.calculate_sbfp_school_packs();

CREATE OR REPLACE FUNCTION public.sbfp_school_milk_type_code(milk_type TEXT,sdo TEXT,remarks TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE
  code TEXT := upper(btrim(coalesce(milk_type,'')));
  label TEXT := upper(coalesce(sdo,'') || ' ' || coalesce(remarks,''));
BEGIN
  IF code='PM' OR code LIKE 'PASTEUR%' OR code='SMP' THEN RETURN 'PM'; END IF;
  IF code='SM' OR code LIKE 'STERIL%' THEN RETURN 'SM'; END IF;
  IF code IN ('CM','COM','KARABAO') OR code LIKE 'COMMERCIAL%' THEN RETURN 'CM'; END IF;
  IF label ~ '\mCM\M|COMMERCIAL' THEN RETURN 'CM'; END IF;
  IF label ~ '\mSM\M|STERIL' THEN RETURN 'SM'; END IF;
  IF label ~ '\mPM\M|PASTEUR' THEN RETURN 'PM'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.use_sbfp_school_packs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  school public.sbfp_dropoff_points%ROWTYPE;
  parent public.sbfp_data%ROWTYPE;
  code TEXT;
  volume NUMERIC;
  raw_milk NUMERIC;
BEGIN
  IF NEW.source_dropoff_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO school FROM public.sbfp_dropoff_points WHERE id=NEW.source_dropoff_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SBFP school source not found.'; END IF;
  SELECT * INTO parent FROM public.sbfp_data WHERE id=school.sbfp_data_id AND year=school.year
    AND (upper(btrim(center))=upper(btrim(school.center)) OR (
      upper(btrim(center)) IN ('NHQ','NIZ','NHQGP','NHQGP (NIZ)') AND
      upper(btrim(school.center)) IN ('NHQ','NIZ','NHQGP','NHQGP (NIZ)')));
  code := public.sbfp_school_milk_type_code(parent.milk_type::TEXT,parent.sdo,coalesce(parent.remarks,'') || ' ' || coalesce(school.sdo,''));
  IF code IS NULL THEN code := public.sbfp_school_milk_type_code(NEW.milk_type::TEXT,NULL,NULL); END IF;
  NEW.milk_packs := public.sbfp_school_calculated_packs(school.beneficiaries,school.feeding_days);
  NEW.beneficiaries := school.beneficiaries;
  NEW.feeding_days := school.feeding_days;
  NEW.milk_type := code;
  volume := CASE WHEN code='SM' THEN NEW.milk_packs * 0.18 WHEN code IS NOT NULL THEN NEW.milk_packs * 0.20 ELSE NULL END;
  raw_milk := volume * 0.20;
  NEW.total_volume_requirements := round(volume,4);
  NEW.raw_milk_liters := round(raw_milk,4);
  NEW.whole_milk_kg := round(raw_milk * 0.268,4);
  NEW.skimmed_milk_kg := round(raw_milk * 0.274,4);
  NEW.sugar := round(volume * 0.02,4);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER mfp_use_sbfp_school_packs
BEFORE INSERT OR UPDATE ON public.mfp_data
FOR EACH ROW EXECUTE FUNCTION public.use_sbfp_school_packs();

-- Refresh existing mirrors on count, SDO and parent-milk-type changes, even if
-- the milk price/amount stayed equal or remains unknown. The MFP BEFORE triggers
-- apply both the financial and pack/formulation source of truth atomically.
CREATE OR REPLACE TRIGGER sbfp_school_finance_sync
AFTER UPDATE ON public.sbfp_dropoff_points
FOR EACH ROW EXECUTE FUNCTION public.sync_sbfp_school_finance();

REVOKE ALL ON FUNCTION public.calculate_sbfp_school_packs() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.use_sbfp_school_packs() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sbfp_school_calculated_packs(INTEGER,INTEGER) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.sbfp_school_milk_type_code(TEXT,TEXT,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sbfp_school_calculated_packs(INTEGER,INTEGER) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sbfp_school_milk_type_code(TEXT,TEXT,TEXT) TO authenticated,service_role;

UPDATE public.sbfp_dropoff_points SET milk_packs=milk_packs
WHERE milk_packs IS DISTINCT FROM beneficiaries::BIGINT * feeding_days::BIGINT;
UPDATE public.mfp_data SET milk_packs=milk_packs
WHERE source_dropoff_id IN (SELECT id FROM public.sbfp_dropoff_points);

NOTIFY pgrst,'reload schema';
COMMIT;

-- Verification: school milk_packs must equal beneficiaries*feeding_days;
-- linked MFP counts and formulations must match their school source.
-- Any failure rolls back this transaction. After commit, use a corrective
-- migration and the reviewed export to restore old derived values if required.
