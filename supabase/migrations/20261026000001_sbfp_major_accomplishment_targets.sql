-- Tab 8 (Major Accomplishments) editable targets per school year.
create table if not exists public.sbfp_major_accomplishment_targets (
  school_year text primary key,
  targets jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.sbfp_major_accomplishment_targets enable row level security;

drop policy if exists "major targets read" on public.sbfp_major_accomplishment_targets;
create policy "major targets read" on public.sbfp_major_accomplishment_targets
  for select to authenticated using (true);
