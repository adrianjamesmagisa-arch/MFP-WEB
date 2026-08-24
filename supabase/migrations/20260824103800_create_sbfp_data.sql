create table if not exists public.sbfp_data (
  id uuid default gen_random_uuid() primary key,
  year integer not null default extract(year from current_date),
  region text not null,
  sdo text not null,
  procurement_status text not null,
  packs_to_deliver integer not null default 0,
  milk_type text not null,
  delivery_schedule text not null,
  packs_delivered integer not null default 0,
  center text not null,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.sbfp_data enable row level security;

-- Create policies
create policy "Enable read access for all authenticated users"
  on public.sbfp_data for select
  to authenticated
  using (true);

create policy "Enable insert for authenticated users"
  on public.sbfp_data for insert
  to authenticated
  with check (true);

create policy "Enable update for authenticated users"
  on public.sbfp_data for update
  to authenticated
  using (true)
  with check (true);

create policy "Enable delete for authenticated users"
  on public.sbfp_data for delete
  to authenticated
  using (true);
