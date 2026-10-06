-- =============================================================================
-- Seed New Cooperatives (2026-10-06)
-- Adds 3 new cooperatives: Albay Processing Plant, Don Bosco Cooperative,
-- and UNICARABAI.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
-- =============================================================================

INSERT INTO public.cooperatives (name, short_name, is_active)
VALUES
  ('Albay Processing Plant',    'Albay Processing', TRUE),
  ('Don Bosco Cooperative',     'Don Bosco (NDA)',  TRUE),
  ('UNICARABAI',                'UNICARABAI',       TRUE)
ON CONFLICT (name) DO NOTHING;
