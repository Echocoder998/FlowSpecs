create table if not exists public.vendor_directory (
  id uuid primary key default gen_random_uuid(),
  vendor_name text not null default '',
  product_or_category text not null default '',
  mce_group text not null default '',
  business_unit text not null default '',
  line_card text not null default '',
  branch_name text not null default '',
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  contact_title text not null default '',
  notes text not null default '',
  source_file text not null default '',
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

drop trigger if exists vendor_directory_set_updated_at on public.vendor_directory;

create trigger vendor_directory_set_updated_at
before update on public.vendor_directory
for each row
execute function public.set_updated_at();

alter table public.vendor_directory enable row level security;

create table if not exists public.admin_uploads (
  id uuid primary key default gen_random_uuid(),
  file_name text not null default '',
  file_type text not null default '',
  row_count integer not null default 0,
  status text not null default 'parsed',
  created_at timestamptz not null default now()
);

alter table public.admin_uploads enable row level security;

-- No RLS policies are created for either table. Row level security is
-- enabled with no grants, so the anon/public API key can neither read nor
-- write these tables (contact names/emails/phones must not be exposed to
-- the public client). All access goes through the Supabase service role
-- key from server-side API routes only (see lib/supabase-admin.ts).
