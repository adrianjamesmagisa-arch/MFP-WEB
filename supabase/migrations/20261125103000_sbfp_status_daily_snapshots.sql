-- Daily snapshots of SBFP SDO implementation status counts per center and school year.
-- Captures live counts whenever status/report changes occur or reports are viewed,
-- and supports manual Super Admin backfills for historical dates.

CREATE TABLE IF NOT EXISTS public.sbfp_status_daily_snapshots (
  snapshot_date DATE NOT NULL,
  year INTEGER NOT NULL,
  center TEXT NOT NULL,
  for_preparation INTEGER NOT NULL DEFAULT 0,
  ongoing_procurement INTEGER NOT NULL DEFAULT 0,
  ongoing_for_award INTEGER NOT NULL DEFAULT 0,
  for_delivery INTEGER NOT NULL DEFAULT 0,
  ongoing_delivery INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  sdo_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'backfill')),
  updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (snapshot_date, year, center)
);

CREATE INDEX IF NOT EXISTS idx_sbfp_status_daily_snapshots_year_date
  ON public.sbfp_status_daily_snapshots (year, snapshot_date DESC);

ALTER TABLE public.sbfp_status_daily_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sbfp_status_daily_snapshots_select ON public.sbfp_status_daily_snapshots;
CREATE POLICY sbfp_status_daily_snapshots_select
  ON public.sbfp_status_daily_snapshots
  FOR SELECT TO authenticated
  USING (true);
