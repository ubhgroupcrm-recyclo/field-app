-- Registered tablets and 2D scanners. A random browser token identifies the device;
-- browsers cannot safely expose a hardware serial number to a web application.
create table if not exists public.registered_devices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  device_token uuid not null unique,
  name text not null check (length(trim(name)) between 1 and 120),
  device_type text not null default '2D scanner / tablet',
  assigned_user_id uuid references public.profiles(id) on delete set null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists registered_devices_project_idx on public.registered_devices(project_id, is_active);
alter table public.registered_devices enable row level security;
revoke all on public.registered_devices from anon, authenticated;
grant select, insert, update on public.registered_devices to authenticated;

drop policy if exists "members view project devices" on public.registered_devices;
drop policy if exists "admins manage registered devices" on public.registered_devices;
create policy "members view project devices" on public.registered_devices for select to authenticated using (
  (select public.is_rayet_admin()) or exists(select 1 from public.project_members m where m.project_id=registered_devices.project_id and m.user_id=(select auth.uid()))
);
create policy "admins manage registered devices" on public.registered_devices for all to authenticated using ((select public.is_rayet_admin())) with check ((select public.is_rayet_admin()));
