-- Run once in Supabase SQL Editor (Run without RLS).
-- Stores field inspection outcomes and enables private project evidence uploads.
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_kind text not null check (asset_kind in ('panel','pallet','delivery','telehandler')),
  asset_code text not null,
  inspection_type text not null check (inspection_type in ('delivery_receipt','panel_visual','installation','telehandler_pre_use')),
  outcome text not null check (outcome in ('passed','failed')),
  notes text,
  photo_path text,
  location_id uuid references public.site_locations(id),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists inspections_project_asset_idx on public.inspections(project_id,asset_code,created_at desc);

alter table public.inspections enable row level security;
revoke all on public.inspections from anon,authenticated;
grant select,insert on public.inspections to authenticated;
drop policy if exists "members view inspections" on public.inspections;
drop policy if exists "operators create inspections" on public.inspections;
create policy "members view inspections" on public.inspections for select to authenticated using (
  exists(select 1 from public.project_members m where m.project_id=inspections.project_id and m.user_id=(select auth.uid()))
);
create policy "operators create inspections" on public.inspections for insert to authenticated with check (
  recorded_by=(select auth.uid()) and public.has_project_role(project_id,array['operative'])
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('project-evidence','project-evidence',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=10485760, allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "project members view evidence" on storage.objects;
drop policy if exists "operators upload evidence" on storage.objects;
create policy "project members view evidence" on storage.objects for select to authenticated using (
  bucket_id='project-evidence' and exists(select 1 from public.project_members m where m.project_id=(storage.foldername(name))[1]::uuid and m.user_id=(select auth.uid()))
);
create policy "operators upload evidence" on storage.objects for insert to authenticated with check (
  bucket_id='project-evidence' and exists(select 1 from public.project_members m where m.project_id=(storage.foldername(name))[1]::uuid and m.user_id=(select auth.uid()))
);
