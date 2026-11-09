-- Pending setup/corrective script: NOT executed against production.
-- Replaces the manual allocation design. Run this file alone, whether the older
-- sbfp_dropoff_finances.sql was applied or not. Keep any applied migration unchanged.
-- Promote with `supabase migration new sbfp_dropoff_automatic_finances` when CLI is available.
-- Test in disposable/staging Postgres first; inspect target schema/RLS before production.
-- First apply sbfp_profile_lookup_search_path_fix.sql for existing get_my_role /
-- get_my_center RLS helpers; they must resolve public.profiles with an empty caller search_path.
-- Verified using tests/sql/sbfp-dropoff-automatic-finances.mjs on an isolated
-- PostgreSQL fixture (fresh setup + previous manual setup), not the live schema.
-- Impact: recalculates ALL existing school milk amounts and linked MFP milk costs.
-- Shipping values and school/MFP membership are preserved. No records are created/deleted.
-- Export existing school/MFP financial values before production execution for recovery.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.sbfp_dropoff_points
  ADD COLUMN IF NOT EXISTS contract_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS service_fee NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS contract_unit_price NUMERIC;

-- IF NOT EXISTS alone does not establish compatibility with an earlier manual setup.
DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'sbfp_dropoff_points' AND column_name IN ('contract_amount', 'service_fee')
      AND data_type = 'numeric' AND numeric_precision = 14 AND numeric_scale = 2
      AND is_nullable = 'YES') <> 2 THEN
    RAISE EXCEPTION 'Expected nullable numeric(14,2) school financial columns; inspect schema before proceeding.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'sbfp_dropoff_points' AND column_name = 'contract_unit_price'
      AND data_type = 'numeric' AND numeric_precision IS NULL AND is_nullable = 'YES') THEN
    RAISE EXCEPTION 'Expected nullable unconstrained numeric contract_unit_price.';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'mfp_data' AND column_name IN ('milk_cost', 'total_funds_transferred')
      AND is_nullable = 'YES' AND data_type IN ('numeric', 'double precision', 'real')) <> 2 THEN
    RAISE EXCEPTION 'MFP milk_cost and total_funds_transferred must support unknown (NULL) amounts; inspect schema first.';
  END IF;
END $$;

ALTER TABLE public.sbfp_dropoff_points
  DROP CONSTRAINT IF EXISTS sbfp_dropoff_contract_amount_range,
  DROP CONSTRAINT IF EXISTS sbfp_dropoff_service_fee_range;
ALTER TABLE public.sbfp_dropoff_points
  ADD CONSTRAINT sbfp_dropoff_contract_amount_range CHECK (contract_amount BETWEEN 0 AND 999999999999.99),
  ADD CONSTRAINT sbfp_dropoff_service_fee_range CHECK (service_fee BETWEEN 0 AND 999999999999.99);

COMMENT ON COLUMN public.sbfp_dropoff_points.contract_amount IS
  'Automatic school milk cost: encoder milk_packs times linked SDO pack price, rounded to cents. NULL for missing/invalid inputs.';
COMMENT ON COLUMN public.sbfp_dropoff_points.service_fee IS
  'Encoder-entered shipping/service fee, additional to milk cost. NULL means not encoded; 0 explicitly means none.';
COMMENT ON COLUMN public.sbfp_dropoff_points.contract_unit_price IS
  'Automatically resolved linked SDO price: PM=25, SM=30, CM=SDO pack_unit_price. Also marks automatic-finance schema readiness.';

CREATE OR REPLACE FUNCTION public.sbfp_school_pack_price(milk_type TEXT, pack_price NUMERIC, sdo TEXT, remarks TEXT)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  code TEXT := upper(btrim(coalesce(milk_type, '')));
  label TEXT := upper(coalesce(sdo, '') || ' ' || coalesce(remarks, ''));
BEGIN
  IF code = 'PM' OR code LIKE 'PASTEUR%' OR code = 'SMP' THEN code := 'PM';
  ELSIF code = 'SM' OR code LIKE 'STERIL%' THEN code := 'SM';
  ELSIF code IN ('CM', 'COM', 'KARABAO') OR code LIKE 'COMMERCIAL%' THEN code := 'CM';
  ELSIF label ~ '\mCM\M|COMMERCIAL' THEN code := 'CM';
  ELSIF label ~ '\mSM\M|STERIL' THEN code := 'SM';
  ELSIF label ~ '\mPM\M|PASTEUR' THEN code := 'PM';
  ELSE RETURN NULL;
  END IF;
  IF code = 'PM' THEN RETURN 25; END IF;
  IF code = 'SM' THEN RETURN 30; END IF;
  IF pack_price > 0 AND pack_price::TEXT NOT IN ('NaN', 'Infinity', '-Infinity') THEN RETURN pack_price; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sbfp_school_milk_cost(packs INTEGER, pack_price NUMERIC)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE WHEN packs >= 0 AND pack_price > 0
    AND pack_price::TEXT NOT IN ('NaN', 'Infinity', '-Infinity')
    AND round(packs::NUMERIC * pack_price, 2) <= 999999999999.99
    THEN round(packs::NUMERIC * pack_price, 2) ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.guard_sbfp_school_finance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  parent public.sbfp_data%ROWTYPE;
  shipping_changed BOOLEAN;
  allowed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN shipping_changed := NEW.service_fee IS NOT NULL;
  ELSE
    shipping_changed := NEW.service_fee IS DISTINCT FROM OLD.service_fee;
    IF OLD.service_fee IS NOT NULL AND NEW.service_fee IS NULL THEN
      RAISE EXCEPTION 'Enter 0 instead of clearing an encoded shipping fee.';
    END IF;
  END IF;
  IF shipping_changed AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Use the SBFP school financial editor to save shipping fees.' USING ERRCODE = '42501';
  END IF;
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (
      p.role::TEXT = 'super_admin' OR (p.role::TEXT = 'encoder' AND (
        upper(btrim(p.center)) = upper(btrim(NEW.center)) OR (
          upper(btrim(p.center)) IN ('NHQ', 'NIZ', 'NHQGP', 'NHQGP (NIZ)') AND
          upper(btrim(NEW.center)) IN ('NHQ', 'NIZ', 'NHQGP', 'NHQGP (NIZ)')
        ))))) INTO allowed;
    IF NOT allowed THEN RAISE EXCEPTION 'School is outside your assigned center.' USING ERRCODE = '42501'; END IF;
    IF TG_OP = 'UPDATE' AND (NEW.center IS DISTINCT FROM OLD.center OR NEW.year IS DISTINCT FROM OLD.year) THEN
      RAISE EXCEPTION 'Use the school editor in its assigned center and year.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Serialize against parent price changes. A concurrent deadlock fails the complete
  -- transaction visibly; never silently commit a price from an older parent version.
  SELECT * INTO parent FROM public.sbfp_data WHERE id = NEW.sbfp_data_id
    AND year = NEW.year AND (upper(btrim(center)) = upper(btrim(NEW.center)) OR (
      upper(btrim(center)) IN ('NHQ', 'NIZ', 'NHQGP', 'NHQGP (NIZ)') AND
      upper(btrim(NEW.center)) IN ('NHQ', 'NIZ', 'NHQGP', 'NHQGP (NIZ)')))
    FOR SHARE;
  NEW.contract_unit_price := NULL;
  IF FOUND THEN NEW.contract_unit_price := public.sbfp_school_pack_price(parent.milk_type::TEXT, parent.pack_unit_price, parent.sdo, parent.remarks); END IF;
  NEW.contract_amount := public.sbfp_school_milk_cost(NEW.milk_packs, NEW.contract_unit_price);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER sbfp_school_finance_guard
BEFORE INSERT OR UPDATE ON public.sbfp_dropoff_points
FOR EACH ROW EXECUTE FUNCTION public.guard_sbfp_school_finance();

CREATE OR REPLACE FUNCTION public.use_sbfp_school_finance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE school public.sbfp_dropoff_points%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.source_dropoff_id IS NOT NULL
    AND NEW.source_dropoff_id IS DISTINCT FROM OLD.source_dropoff_id
    AND EXISTS (SELECT 1 FROM public.sbfp_dropoff_points WHERE id = OLD.source_dropoff_id) THEN
    RAISE EXCEPTION 'A linked SBFP record must keep its school source.';
  END IF;
  IF NEW.source_dropoff_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO school FROM public.sbfp_dropoff_points WHERE id = NEW.source_dropoff_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SBFP school source not found.'; END IF;
  IF NEW.year IS DISTINCT FROM school.year OR NEW.funded_by::TEXT IS DISTINCT FROM 'DepEd'
    OR NOT (upper(btrim(NEW.center)) = upper(btrim(school.center)) OR (
      upper(btrim(NEW.center)) IN ('NHQ', 'NIZ', 'NHQGP', 'NHQGP (NIZ)') AND
      upper(btrim(school.center)) IN ('NHQ', 'NIZ', 'NHQGP', 'NHQGP (NIZ)'))) THEN
    RAISE EXCEPTION 'Linked MFP records must match the SBFP school program, center, and year.';
  END IF;
  NEW.milk_cost := school.contract_amount;
  IF TG_OP = 'UPDATE' AND OLD.source_dropoff_id = NEW.source_dropoff_id THEN
    NEW.service_fee := OLD.service_fee;
  END IF;
  IF school.service_fee IS NOT NULL THEN NEW.service_fee := school.service_fee; END IF;
  NEW.total_funds_transferred := CASE WHEN school.contract_amount IS NOT NULL AND school.service_fee IS NOT NULL
    THEN school.contract_amount + school.service_fee ELSE NULL END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER mfp_use_sbfp_school_finance
BEFORE INSERT OR UPDATE ON public.mfp_data
FOR EACH ROW EXECUTE FUNCTION public.use_sbfp_school_finance();

CREATE OR REPLACE FUNCTION public.sync_sbfp_school_finance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.mfp_data SET milk_cost = NEW.contract_amount,
    service_fee = coalesce(NEW.service_fee, service_fee),
    total_funds_transferred = CASE WHEN NEW.contract_amount IS NOT NULL AND NEW.service_fee IS NOT NULL
      THEN NEW.contract_amount + NEW.service_fee ELSE NULL END,
    updated_at = now()
  WHERE source_dropoff_id = NEW.id;
  RETURN NEW;
END;
$$;

-- Fire on every UPDATE, not just UPDATE OF contract_amount: a BEFORE trigger changes
-- that column when milk_packs/SDO changes even when it is absent from the SET list.
CREATE OR REPLACE TRIGGER sbfp_school_finance_sync
AFTER UPDATE ON public.sbfp_dropoff_points
FOR EACH ROW WHEN (OLD.contract_amount IS DISTINCT FROM NEW.contract_amount
  OR OLD.service_fee IS DISTINCT FROM NEW.service_fee)
EXECUTE FUNCTION public.sync_sbfp_school_finance();

CREATE OR REPLACE FUNCTION public.refresh_sbfp_school_contracts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.sbfp_dropoff_points SET contract_amount = contract_amount
    WHERE sbfp_data_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER sbfp_parent_school_finance_refresh
AFTER UPDATE OF milk_type, pack_unit_price, sdo, remarks, center, year ON public.sbfp_data
FOR EACH ROW WHEN (OLD.milk_type IS DISTINCT FROM NEW.milk_type OR OLD.pack_unit_price IS DISTINCT FROM NEW.pack_unit_price
  OR OLD.sdo IS DISTINCT FROM NEW.sdo OR OLD.remarks IS DISTINCT FROM NEW.remarks
  OR OLD.center IS DISTINCT FROM NEW.center OR OLD.year IS DISTINCT FROM NEW.year)
EXECUTE FUNCTION public.refresh_sbfp_school_contracts();

REVOKE ALL ON FUNCTION public.guard_sbfp_school_finance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.use_sbfp_school_finance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_sbfp_school_finance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_sbfp_school_contracts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sbfp_school_pack_price(TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sbfp_school_milk_cost(INTEGER, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sbfp_school_pack_price(TEXT, NUMERIC, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sbfp_school_milk_cost(INTEGER, NUMERIC) TO authenticated, service_role;

-- Initialize/reconcile calculated amounts, preserving all manual shipping fees.
-- Existing mirrors only: no missing MFP rows are inserted by this script.
UPDATE public.sbfp_dropoff_points SET contract_amount = contract_amount;
UPDATE public.mfp_data SET milk_cost = milk_cost
WHERE source_dropoff_id IN (SELECT id FROM public.sbfp_dropoff_points);

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verification after staging application:
-- SELECT d.id, d.contract_amount, d.contract_unit_price, m.milk_cost, m.service_fee,
--        m.total_funds_transferred FROM public.sbfp_dropoff_points d
-- LEFT JOIN public.mfp_data m ON m.source_dropoff_id = d.id LIMIT 10;
-- Recovery on any failure: ROLLBACK. After successful commit, preserve columns/data
-- and deploy a corrective migration; restore prior money only from the reviewed export.
