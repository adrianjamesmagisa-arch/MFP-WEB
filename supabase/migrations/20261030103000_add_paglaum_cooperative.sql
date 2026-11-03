-- =============================================================================
-- Add Paglaum Multi-purpose Cooperative (2026-10-30)
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS cooperatives_name_unique_idx
  ON public.cooperatives (name);

INSERT INTO public.cooperatives (name, short_name, is_active)
VALUES
  ('Paglaum Multi-purpose Cooperative', 'PMPC', TRUE)
ON CONFLICT (name) DO NOTHING;

