-- Center activity log for admin tracking of encoder create/edit times.
-- Apply in Supabase SQL Editor if not yet migrated.

CREATE TABLE IF NOT EXISTS public.mfp_center_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  source TEXT NOT NULL,
  source_id UUID,
  summary TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mfp_center_activity_center_created
  ON public.mfp_center_activity (center, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mfp_center_activity_created
  ON public.mfp_center_activity (created_at DESC);

ALTER TABLE public.mfp_center_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mfp_center_activity_select ON public.mfp_center_activity;
CREATE POLICY mfp_center_activity_select ON public.mfp_center_activity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'super_admin'
          OR (p.center IS NOT NULL AND p.center = mfp_center_activity.center)
        )
    )
  );

DROP POLICY IF EXISTS mfp_center_activity_insert ON public.mfp_center_activity;
CREATE POLICY mfp_center_activity_insert ON public.mfp_center_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'super_admin'
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.center IS NOT NULL
          AND p.center = mfp_center_activity.center
      )
    )
  );

-- Keep updated_at fresh on masterlist edits (activity list relies on this).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mfp_data_set_updated_at ON public.mfp_data;
CREATE TRIGGER mfp_data_set_updated_at
  BEFORE UPDATE ON public.mfp_data
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS sbfp_data_set_updated_at ON public.sbfp_data;
CREATE TRIGGER sbfp_data_set_updated_at
  BEFORE UPDATE ON public.sbfp_data
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS sbfp_dropoff_set_updated_at ON public.sbfp_dropoff_points;
CREATE TRIGGER sbfp_dropoff_set_updated_at
  BEFORE UPDATE ON public.sbfp_dropoff_points
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();
