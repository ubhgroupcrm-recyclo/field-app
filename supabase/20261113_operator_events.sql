-- Run this focused migration in Supabase SQL Editor (Run without RLS).
-- It adds the scan ledger and the Shoals Hook operational bays only.
create table if not exists public.asset_movements (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 asset_kind text not null check(asset_kind in ('panel','pallet')),
 asset_code text not null check(length(asset_code) between 1 and 160),
 event_type text not null check(event_type in ('delivery_compound_in','field_storage_in','field_storage_out','field_damaged_in','combiner_arrival','installation','removal','compound_recycling_in','recycling_pallet_started','recycling_pallet_sealed','srs_arrival')),
 location_id uuid references public.site_locations(id),
 parent_pallet_code text,
 inspection_status text check(inspection_status in ('passed','failed','not_required')),
 notes text,
 latitude double precision,
 longitude double precision,
 occurred_at timestamptz not null default now(),
 recorded_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create index if not exists asset_movements_project_asset_idx on public.asset_movements(project_id,asset_code,occurred_at desc);
alter table public.asset_movements drop constraint if exists asset_movements_event_type_check;
alter table public.asset_movements add constraint asset_movements_event_type_check check(event_type in ('delivery_compound_in','field_storage_in','field_storage_out','field_damaged_in','combiner_arrival','installation','removal','compound_recycling_in','recycling_pallet_started','recycling_pallet_sealed','srs_arrival'));
insert into public.site_locations(project_id,name,location_type,field_number)
select p.id,'Compound Delivery IN Bay','compound_delivery_in',null from public.projects p where p.code='SHOALS-HOOK'
on conflict(project_id,name) do nothing;
insert into public.site_locations(project_id,name,location_type,field_number)
select p.id,'Compound Recycling OUT Bay','compound_recycling_out',null from public.projects p where p.code='SHOALS-HOOK'
on conflict(project_id,name) do nothing;
insert into public.site_locations(project_id,name,location_type,field_number)
select p.id,'Field '||n||' Storage IN Bay','field_storage_in',n from public.projects p cross join generate_series(1,6) n where p.code='SHOALS-HOOK'
on conflict(project_id,name) do nothing;
insert into public.site_locations(project_id,name,location_type,field_number)
select p.id,'Field '||n||' Storage OUT Bay','field_storage_out',n from public.projects p cross join generate_series(1,6) n where p.code='SHOALS-HOOK'
on conflict(project_id,name) do nothing;
insert into public.site_locations(project_id,name,location_type,field_number)
select p.id,'Field '||n||' Damaged Area','field_damaged_area',n from public.projects p cross join generate_series(1,6) n where p.code='SHOALS-HOOK'
on conflict(project_id,name) do nothing;
alter table public.asset_movements enable row level security;
revoke all on public.asset_movements from anon,authenticated;
grant select,insert on public.asset_movements to authenticated;
drop policy if exists "members view asset movements" on public.asset_movements;
drop policy if exists "members append asset movements" on public.asset_movements;
create policy "members view asset movements" on public.asset_movements for select to authenticated using (exists(select 1 from public.project_members m where m.project_id=asset_movements.project_id and m.user_id=(select auth.uid())));
create policy "members append asset movements" on public.asset_movements for insert to authenticated with check (recorded_by=(select auth.uid()) and exists(select 1 from public.project_members m where m.project_id=asset_movements.project_id and m.user_id=(select auth.uid())));
