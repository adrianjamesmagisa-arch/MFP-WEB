-- SBFP FY 2026 Monitoring — authoritative source for PIMD accomplishment %
-- One row per center + SDO (or SDO + milk-type lot) from the monitoring Excel.

create table if not exists public.sbfp_monitoring (
  id uuid default gen_random_uuid() primary key,
  year integer not null default 2026,
  center text not null,
  sdo text not null,
  status text not null default 'NOT STARTED',
  target_packs integer not null default 0,
  del_aug18 integer not null default 0,
  del_aug31 integer not null default 0,
  del_sep30 integer not null default 0,
  del_oct31 integer not null default 0,
  latest_delivered integer not null default 0,
  accomplishment_pct numeric not null default 0,
  amount bigint default 0,
  mode_of_procurement text,
  remarks text,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists sbfp_monitoring_year_center_idx
  on public.sbfp_monitoring (year, center);

alter table public.sbfp_monitoring enable row level security;

create policy "Enable read access for all authenticated users"
  on public.sbfp_monitoring for select
  to authenticated
  using (true);

create policy "Enable insert for authenticated users"
  on public.sbfp_monitoring for insert
  to authenticated
  with check (true);

create policy "Enable update for authenticated users"
  on public.sbfp_monitoring for update
  to authenticated
  using (true)
  with check (true);

create policy "Enable delete for authenticated users"
  on public.sbfp_monitoring for delete
  to authenticated
  using (true);
