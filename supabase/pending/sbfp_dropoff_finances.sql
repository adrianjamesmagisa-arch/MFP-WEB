-- SUPERSEDED: do not run this manual-allocation draft.
-- Use sbfp_dropoff_automatic_finances.sql instead; it supports fresh setup and upgrade.
-- Pending migration draft. Not executed against a shared/production database.
-- The Supabase CLI is unavailable here; promote using `supabase migration new
-- sbfp_dropoff_finances` and copy this body into its generated file before deployment.
-- Adds nullable allocations without changing/backfilling any existing financial data.
-- Apply to a disposable/staging database first, then inspect the target schema and approve production.
BEGIN;

ALTER TABLE public.sbfp_dropoff_points
  ADD COLUMN contract_amount NUMERIC(14, 2),
  ADD COLUMN service_fee NUMERIC(14, 2),
  ADD CONSTRAINT sbfp_dropoff_contract_amount_range CHECK (contract_amount BETWEEN 0 AND 999999999999.99),
  ADD CONSTRAINT sbfp_dropoff_service_fee_range CHECK (service_fee BETWEEN 0 AND 999999999999.99);

COMMENT ON COLUMN public.sbfp_dropoff_points.contract_amount IS
  'Encoder-entered school allocation of the SDO milk-only contract. NULL means not encoded.';
COMMENT ON COLUMN public.sbfp_dropoff_points.service_fee IS
  'Encoder-entered school shipping/service fee, additional to the milk contract. NULL means not encoded.';

-- Financial edits go through the server endpoint, which checks the authenticated
-- profile and assigned center before using service_role. Other school edits retain
-- their current client flow, with an additional scope check once money is encoded.
CREATE FUNCTION public.guard_sbfp_school_finance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  money_changed BOOLEAN;
  allowed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    money_changed := NEW.contract_amount IS NOT NULL OR NEW.service_fee IS NOT NULL;
  ELSE
    money_changed := NEW.contract_amount IS DISTINCT FROM OLD.contract_amount
      OR NEW.service_fee IS DISTINCT FROM OLD.service_fee;
    IF (OLD.contract_amount IS NOT NULL AND NEW.contract_amount IS NULL)
      OR (OLD.service_fee IS NOT NULL AND NEW.service_fee IS NULL) THEN
      RAISE EXCEPTION 'Enter 0 instead of clearing an encoded school amount.';
    END IF;
  END IF;

  IF money_changed AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Use the SBFP school financial editor to save amounts.' USING ERRCODE = '42501';
  END IF;

  IF NEW.contract_amount IS NOT NULL OR NEW.service_fee IS NOT NULL THEN
    IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
      SELECT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (
          p.role::TEXT = 'super_admin' OR (p.role::TEXT = 'encoder' AND (
            upper(btrim(p.center)) = upper(btrim(NEW.center)) OR (
              upper(btrim(p.center)) IN ('NHQ', 'NIZ', 'NHQGP', 'NHQGP (NIZ)') AND
              upper(btrim(NEW.center)) IN ('NHQ', 'NIZ', 'NHQGP', 'NHQGP (NIZ)')
            )
          ))
        )
      ) INTO allowed;
      IF NOT allowed THEN RAISE EXCEPTION 'School is outside your assigned center.' USING ERRCODE = '42501'; END IF;
      IF TG_OP = 'UPDATE' AND (NEW.center IS DISTINCT FROM OLD.center OR NEW.year IS DISTINCT FROM OLD.year) THEN
        RAISE EXCEPTION 'A school with encoded amounts cannot change center or year.';
      END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sbfp_data p WHERE p.id = NEW.sbfp_data_id
      AND p.year = NEW.year AND p.center = NEW.center) THEN
      RAISE EXCEPTION 'Link this school to an SDO contract in the same center and year first.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sbfp_school_finance_guard
BEFORE INSERT OR UPDATE ON public.sbfp_dropoff_points
FOR EACH ROW EXECUTE FUNCTION public.guard_sbfp_school_finance();

-- Enforce the source of truth even for generic MFP form, bulk-edit, import,
-- and background-sync writes. Missing school amounts preserve existing money.
CREATE FUNCTION public.use_sbfp_school_finance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  school public.sbfp_dropoff_points%ROWTYPE;
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
      upper(btrim(school.center)) IN ('NHQ', 'NIZ', 'NHQGP', 'NHQGP (NIZ)')
    )) THEN
    RAISE EXCEPTION 'Linked MFP records must match the SBFP school program, center, and year.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.source_dropoff_id = NEW.source_dropoff_id THEN
    NEW.milk_cost := OLD.milk_cost;
    NEW.service_fee := OLD.service_fee;
    NEW.total_funds_transferred := OLD.total_funds_transferred;
  END IF;
  IF school.contract_amount IS NOT NULL THEN NEW.milk_cost := school.contract_amount; END IF;
  IF school.service_fee IS NOT NULL THEN NEW.service_fee := school.service_fee; END IF;
  IF school.contract_amount IS NOT NULL OR school.service_fee IS NOT NULL THEN
    NEW.total_funds_transferred := coalesce(NEW.milk_cost, 0) + coalesce(NEW.service_fee, 0);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mfp_use_sbfp_school_finance
BEFORE INSERT OR UPDATE ON public.mfp_data
FOR EACH ROW EXECUTE FUNCTION public.use_sbfp_school_finance();

-- Source + existing mirror update in one transaction. Never creates/deletes
-- schools or MFP rows, and never copies an entire SDO contract to a school.
CREATE FUNCTION public.sync_sbfp_school_finance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.mfp_data SET
    milk_cost = coalesce(NEW.contract_amount, milk_cost),
    service_fee = coalesce(NEW.service_fee, service_fee),
    total_funds_transferred = coalesce(NEW.contract_amount, milk_cost, 0)
      + coalesce(NEW.service_fee, service_fee, 0),
    updated_at = now()
  WHERE source_dropoff_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sbfp_school_finance_sync
AFTER UPDATE OF contract_amount, service_fee ON public.sbfp_dropoff_points
FOR EACH ROW WHEN (OLD.contract_amount IS DISTINCT FROM NEW.contract_amount
  OR OLD.service_fee IS DISTINCT FROM NEW.service_fee)
EXECUTE FUNCTION public.sync_sbfp_school_finance();

REVOKE ALL ON FUNCTION public.guard_sbfp_school_finance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.use_sbfp_school_finance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_sbfp_school_finance() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Recovery: roll back this transaction if it fails. After deployment, prefer
-- reverting application code while keeping the additive nullable columns/data.
-- Do not drop populated columns or bulk-rewrite MFP amounts without a reviewed export.
