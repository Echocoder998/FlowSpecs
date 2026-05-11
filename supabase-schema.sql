create table if not exists public.datasheets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_name text not null default '',
  profile jsonb not null default '{}'::jsonb,
  part_number text not null default '',
  confidence_label text not null default 'Pending',
  questionnaire jsonb not null,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists datasheets_set_updated_at on public.datasheets;

create trigger datasheets_set_updated_at
before update on public.datasheets
for each row
execute function public.set_updated_at();

alter table public.datasheets enable row level security;

create policy "Allow anonymous datasheet reads"
on public.datasheets
for select
to anon
using (true);

create policy "Allow anonymous datasheet inserts"
on public.datasheets
for insert
to anon
with check (true);

create policy "Allow anonymous datasheet updates"
on public.datasheets
for update
to anon
using (true)
with check (true);

create policy "Allow anonymous datasheet deletes"
on public.datasheets
for delete
to anon
using (true);
