-- SRS / Shoals Hook database setup. Run once in Supabase Dashboard > SQL Editor.
-- Sign-in accounts use normal work emails. Set their password via recovery to PT-<four-digit-PIN>.

create table if not exists public.profiles (id uuid primary key references auth.users(id) on delete cascade,staff_id text not null unique check (staff_id ~ '^[A-Za-z0-9_-]{2,40}$'),display_name text not null,role text not null default 'member' check (role in ('member','admin')),created_at timestamptz not null default now());
create table if not exists public.projects (id uuid primary key default gen_random_uuid(),company text not null default 'SRS',name text not null,code text unique,created_at timestamptz not null default now(),unique (company,name));
create table if not exists public.site_locations (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,name text not null,location_type text not null check(location_type in ('compound_delivery_in','compound_recycling_out','field_storage_in','field_storage_out','field_damaged_area')),field_number integer check(field_number between 1 and 6),is_active boolean not null default true,unique(project_id,name));
create table if not exists public.combiner_boxes (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,field_number integer not null check(field_number between 1 and 6),box_code text not null,is_active boolean not null default true,unique(project_id,box_code));
create table if not exists public.install_allocations (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,pallet_id uuid references public.inventory_pallets(id),panel_id uuid references public.inventory_panels(id),destination_location_id uuid references public.site_locations(id),combiner_box_id uuid references public.combiner_boxes(id),source_reference text,created_at timestamptz not null default now(),check(pallet_id is not null or panel_id is not null));
create table if not exists public.project_members (project_id uuid not null references public.projects(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,role text not null default 'worker' check (role in ('worker','supervisor','admin')),assigned_at timestamptz not null default now(),primary key (project_id,user_id));
create table if not exists public.project_member_roles (project_id uuid not null references public.projects(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,role text not null check(role in ('operative','telehandler_operator','senior_electrician','site_manager')),assigned_at timestamptz not null default now(),primary key(project_id,user_id,role));
create table if not exists public.deliveries (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,order_number text not null,proforma_reference text,expected_pallets integer not null check(expected_pallets>0),expected_modules integer,gross_weight_kg numeric(12,2),wattage_breakdown text not null,qr_token uuid not null default gen_random_uuid() unique,status text not null default 'expected' check(status in ('expected','receiving','complete','exception')),created_at timestamptz not null default now(),unique(project_id,order_number));
create table if not exists public.inventory_pallets (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,pallet_number text not null,model_type text,container_number text,lot_number text,expected_panel_count integer not null default 0,receipt_status text not null default 'expected' check(receipt_status in ('expected','received','exception')),created_at timestamptz not null default now(),unique(project_id,pallet_number));
create table if not exists public.inventory_panels (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,pallet_id uuid not null references public.inventory_pallets(id) on delete cascade,serial_number text not null,model_type text,expected_isc numeric(8,3),expected_voc numeric(8,3),expected_pmax numeric(8,3),expected_vpm numeric(8,3),expected_ipm numeric(8,3),expected_ff numeric(8,3),colour_grade text,connector text,source_file text not null,source_sheet text,source_row integer,inventory_status text not null default 'expected' check(inventory_status in ('expected','received','installed','passed','failed','quarantined')),created_at timestamptz not null default now(),unique(project_id,serial_number));
create table if not exists public.recycling_loads (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,load_reference text not null,facility_name text not null default 'SRS - Swanscombe',status text not null default 'open' check(status in ('open','collected','delivered','exception')),created_at timestamptz not null default now(),collected_at timestamptz,delivered_at timestamptz,latitude double precision,longitude double precision,vehicle_reference text,weight_kg numeric(12,2),created_by uuid not null references public.profiles(id),unique(project_id,load_reference));
create table if not exists public.removal_items (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,serial_or_barcode text not null,removed_at timestamptz not null default now(),latitude double precision,longitude double precision,isolation_confirmed boolean not null default false,isolation_reference text,condition_note text,photo_path text,recycling_load_id uuid references public.recycling_loads(id),status text not null default 'removed' check(status in ('removed','loaded','recycled','exception')),removed_by uuid not null references public.profiles(id),created_at timestamptz not null default now());
create table if not exists public.isolation_certificates (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,certificate_reference text not null,equipment_details jsonb not null,requirements jsonb not null,isolations jsonb not null,handover_name text not null,handover_signature text not null,handover_at timestamptz not null,prove_dead_name text not null,prove_dead_signature text not null,prove_dead_at timestamptz not null,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(project_id,certificate_reference));
-- The scan-led operational history.  This is append-only: every physical handover
-- is a separate event, so a panel/pallet can be audited even when work happens out of order.
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
create index if not exists inventory_panels_project_pallet_idx on public.inventory_panels(project_id,pallet_id);
create table if not exists public.custody_events (id uuid primary key,project_id uuid references public.projects(id),barcode text not null check (length(barcode) between 1 and 120),stage smallint not null check (stage between 1 and 3),occurred_at timestamptz not null,latitude double precision,longitude double precision,isolation_confirmed boolean not null default false,isolation_reference text,photo_path text,recorded_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),check ((stage=1 and isolation_confirmed and isolation_reference is not null) or stage in (2,3)));
alter table public.custody_events add column if not exists project_id uuid references public.projects(id);
-- Simplified workflow: 1 = before removal; 2 = recycling delivery. Remove legacy storage events, then convert delivery.
do $$ begin if exists(select 1 from public.custody_events where stage=3) then delete from public.custody_events where stage=2; update public.custody_events set stage=2 where stage=3; end if; end $$;
alter table public.custody_events drop constraint if exists custody_events_stage_check;
alter table public.custody_events drop constraint if exists custody_events_check;
alter table public.custody_events drop constraint if exists custody_events_safety_check;
alter table public.custody_events add constraint custody_events_stage_check check (stage in (1,2));
alter table public.custody_events add constraint custody_events_safety_check check ((stage=1 and isolation_confirmed and isolation_reference is not null) or stage=2);
insert into public.projects (company,name,code) values ('SRS','Shoals Hook','SHOALS-HOOK') on conflict (company,name) do nothing;
-- Baseline operational bays.  Admin can add/edit locations and combiner boxes later.
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
update public.custody_events set project_id=(select id from public.projects where company='SRS' and name='Shoals Hook') where project_id is null;
alter table public.custody_events alter column project_id set not null;
create index if not exists custody_events_project_barcode_idx on public.custody_events (project_id,barcode,occurred_at desc);

alter table public.profiles enable row level security; alter table public.projects enable row level security; alter table public.project_members enable row level security; alter table public.deliveries enable row level security; alter table public.custody_events enable row level security;
alter table public.inventory_pallets enable row level security; alter table public.inventory_panels enable row level security;
alter table public.recycling_loads enable row level security; alter table public.removal_items enable row level security; alter table public.isolation_certificates enable row level security;
alter table public.asset_movements enable row level security;
alter table public.site_locations enable row level security; alter table public.combiner_boxes enable row level security; alter table public.install_allocations enable row level security;
alter table public.project_member_roles enable row level security;
revoke all on public.profiles,public.projects,public.project_members,public.custody_events from anon,authenticated;
revoke all on public.deliveries from anon,authenticated;
revoke all on public.inventory_pallets,public.inventory_panels from anon,authenticated;
revoke all on public.recycling_loads,public.removal_items,public.isolation_certificates from anon,authenticated;
revoke all on public.asset_movements from anon,authenticated;
revoke all on public.site_locations,public.combiner_boxes,public.install_allocations from anon,authenticated;
revoke all on public.project_member_roles from anon,authenticated;
grant select on public.profiles,public.projects,public.project_members to authenticated; grant select,insert on public.custody_events to authenticated;
grant select on public.deliveries to authenticated;
grant select on public.inventory_pallets,public.inventory_panels to authenticated;
grant select,insert,update on public.recycling_loads,public.removal_items to authenticated; grant select,insert on public.isolation_certificates to authenticated;
grant select,insert on public.asset_movements to authenticated;
grant select,insert,update,delete on public.site_locations,public.combiner_boxes,public.install_allocations to authenticated;
grant select,insert,delete on public.project_member_roles to authenticated;
grant insert,update,delete on public.projects,public.project_members,public.deliveries,public.inventory_pallets,public.inventory_panels to authenticated;
drop policy if exists "staff may view profiles" on public.profiles; drop policy if exists "staff may view custody events" on public.custody_events; drop policy if exists "staff may append custody events" on public.custody_events;
drop policy if exists "users view own profile" on public.profiles; drop policy if exists "users view assigned memberships" on public.project_members; drop policy if exists "users view assigned projects" on public.projects; drop policy if exists "members view their project events" on public.custody_events; drop policy if exists "members append their project events" on public.custody_events;
create policy "users view own profile" on public.profiles for select to authenticated using ((select auth.uid())=id);
create policy "users view assigned memberships" on public.project_members for select to authenticated using ((select auth.uid())=user_id);
create policy "users view assigned projects" on public.projects for select to authenticated using (exists(select 1 from public.project_members m where m.project_id=projects.id and m.user_id=(select auth.uid())));
create policy "members view their project events" on public.custody_events for select to authenticated using (exists(select 1 from public.project_members m where m.project_id=custody_events.project_id and m.user_id=(select auth.uid())));
create policy "members append their project events" on public.custody_events for insert to authenticated with check (recorded_by=(select auth.uid()) and exists(select 1 from public.project_members m where m.project_id=custody_events.project_id and m.user_id=(select auth.uid())));

-- Project-role capability layer. Profile admin remains the SRS platform administrator;
-- operational permissions belong to each project assignment.
insert into public.project_member_roles(project_id,user_id,role) select project_id,user_id,'operative' from public.project_members where role='worker' on conflict do nothing;
insert into public.project_member_roles(project_id,user_id,role) select project_id,user_id,'site_manager' from public.project_members where role in ('supervisor','admin') on conflict do nothing;
create or replace function public.has_project_role(p_project_id uuid,p_roles text[]) returns boolean language sql stable security definer set search_path=public as $$ select (select public.is_rayet_admin()) or exists(select 1 from public.project_member_roles r where r.project_id=p_project_id and r.user_id=(select auth.uid()) and (r.role=any(p_roles) or r.role='site_manager')) $$;
grant execute on function public.has_project_role(uuid,text[]) to authenticated;
drop policy if exists "members view project roles" on public.project_member_roles;
drop policy if exists "admins manage project roles" on public.project_member_roles;
create policy "members view project roles" on public.project_member_roles for select to authenticated using (user_id=(select auth.uid()) or (select public.is_rayet_admin()));
create policy "admins manage project roles" on public.project_member_roles for all to authenticated using ((select public.is_rayet_admin())) with check ((select public.is_rayet_admin()));
drop policy if exists "members append asset movements" on public.asset_movements;
create policy "members append asset movements" on public.asset_movements for insert to authenticated with check (recorded_by=(select auth.uid()) and public.has_project_role(project_id,array['operative']));
drop policy if exists "members manage isolation certificates" on public.isolation_certificates;
drop policy if exists "members view isolation certificates" on public.isolation_certificates;
drop policy if exists "qualified users create isolation certificates" on public.isolation_certificates;
create policy "members view isolation certificates" on public.isolation_certificates for select to authenticated using (exists(select 1 from public.project_members m where m.project_id=isolation_certificates.project_id and m.user_id=(select auth.uid())));
create policy "qualified users create isolation certificates" on public.isolation_certificates for insert to authenticated with check (created_by=(select auth.uid()) and public.has_project_role(project_id,array['senior_electrician']));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('panel-photos','panel-photos',false,5242880,array['image/jpeg','image/png','image/heic']) on conflict (id) do update set public=false,file_size_limit=5242880;
drop policy if exists "staff may read panel evidence" on storage.objects; drop policy if exists "staff may upload panel evidence" on storage.objects; drop policy if exists "members read panel evidence" on storage.objects; drop policy if exists "staff upload own panel evidence" on storage.objects;
create policy "members read panel evidence" on storage.objects for select to authenticated using (bucket_id='panel-photos' and exists(select 1 from public.custody_events e join public.project_members m on m.project_id=e.project_id where e.photo_path=name and m.user_id=(select auth.uid())));
create policy "staff upload own panel evidence" on storage.objects for insert to authenticated with check (bucket_id='panel-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- After creating an Auth user, add their identity and project access. Example for Alex:
-- insert into public.profiles(id,staff_id,display_name,role) select id,'alex','Alex','admin' from auth.users where email='alex@ubhgroup.co.uk';
-- insert into public.project_members(project_id,user_id,role) select p.id,u.id,'admin' from public.projects p join auth.users u on u.email='alex@ubhgroup.co.uk' where p.company='Rayet' and p.name='Shoals Hook';

-- Admin dashboard permissions. Run this portion too if the schema was already applied.
create or replace function public.is_rayet_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin') $$;
grant execute on function public.is_rayet_admin() to authenticated;
drop policy if exists "users or admins view profiles" on public.profiles;
drop policy if exists "members or admins view memberships" on public.project_members;
drop policy if exists "members or admins view projects" on public.projects;
drop policy if exists "members or admins view deliveries" on public.deliveries;
drop policy if exists "admins create projects" on public.projects;
drop policy if exists "admins edit projects" on public.projects;
drop policy if exists "admins manage deliveries" on public.deliveries;
drop policy if exists "members or admins view inventory pallets" on public.inventory_pallets;
drop policy if exists "members or admins view inventory panels" on public.inventory_panels;
drop policy if exists "admins manage inventory pallets" on public.inventory_pallets;
drop policy if exists "admins manage inventory panels" on public.inventory_panels;
drop policy if exists "members view recycling loads" on public.recycling_loads;
drop policy if exists "members view removal items" on public.removal_items;
drop policy if exists "members manage recycling loads" on public.recycling_loads;
drop policy if exists "members manage removal items" on public.removal_items;
drop policy if exists "members manage isolation certificates" on public.isolation_certificates;
drop policy if exists "members view asset movements" on public.asset_movements;
drop policy if exists "members append asset movements" on public.asset_movements;
drop policy if exists "members view site locations" on public.site_locations;
drop policy if exists "members view combiner boxes" on public.combiner_boxes;
drop policy if exists "admins manage site locations" on public.site_locations;
drop policy if exists "admins manage combiner boxes" on public.combiner_boxes;
drop policy if exists "admins manage install allocations" on public.install_allocations;
drop policy if exists "admins assign users" on public.project_members;
drop policy if exists "admins edit assignments" on public.project_members;
drop policy if exists "admins remove assignments" on public.project_members;
drop policy if exists "members or admins view project events" on public.custody_events;
drop policy if exists "members append their project events" on public.custody_events;
drop policy if exists "users view own profile" on public.profiles;
drop policy if exists "users view assigned memberships" on public.project_members;
drop policy if exists "users view assigned projects" on public.projects;
drop policy if exists "members view their project events" on public.custody_events;
drop policy if exists "members append their project events" on public.custody_events;
create policy "users or admins view profiles" on public.profiles for select to authenticated using ((select auth.uid())=id or (select public.is_rayet_admin()));
create policy "members or admins view memberships" on public.project_members for select to authenticated using ((select auth.uid())=user_id or (select public.is_rayet_admin()));
create policy "members or admins view projects" on public.projects for select to authenticated using ((select public.is_rayet_admin()) or exists(select 1 from public.project_members m where m.project_id=projects.id and m.user_id=(select auth.uid())));
create policy "members or admins view deliveries" on public.deliveries for select to authenticated using ((select public.is_rayet_admin()) or exists(select 1 from public.project_members m where m.project_id=deliveries.project_id and m.user_id=(select auth.uid())));
create policy "members or admins view inventory pallets" on public.inventory_pallets for select to authenticated using ((select public.is_rayet_admin()) or exists(select 1 from public.project_members m where m.project_id=inventory_pallets.project_id and m.user_id=(select auth.uid())));
create policy "members or admins view inventory panels" on public.inventory_panels for select to authenticated using ((select public.is_rayet_admin()) or exists(select 1 from public.project_members m where m.project_id=inventory_panels.project_id and m.user_id=(select auth.uid())));
create policy "members view recycling loads" on public.recycling_loads for select to authenticated using (exists(select 1 from public.project_members m where m.project_id=recycling_loads.project_id and m.user_id=(select auth.uid())));
create policy "members view removal items" on public.removal_items for select to authenticated using (exists(select 1 from public.project_members m where m.project_id=removal_items.project_id and m.user_id=(select auth.uid())));
create policy "members manage isolation certificates" on public.isolation_certificates for all to authenticated using (exists(select 1 from public.project_members m where m.project_id=isolation_certificates.project_id and m.user_id=(select auth.uid()))) with check (created_by=(select auth.uid()) and exists(select 1 from public.project_members m where m.project_id=isolation_certificates.project_id and m.user_id=(select auth.uid())));
create policy "members view asset movements" on public.asset_movements for select to authenticated using (exists(select 1 from public.project_members m where m.project_id=asset_movements.project_id and m.user_id=(select auth.uid())));
create policy "members append asset movements" on public.asset_movements for insert to authenticated with check (recorded_by=(select auth.uid()) and exists(select 1 from public.project_members m where m.project_id=asset_movements.project_id and m.user_id=(select auth.uid())));
create policy "members view site locations" on public.site_locations for select to authenticated using (exists(select 1 from public.project_members m where m.project_id=site_locations.project_id and m.user_id=(select auth.uid())));
create policy "members view combiner boxes" on public.combiner_boxes for select to authenticated using (exists(select 1 from public.project_members m where m.project_id=combiner_boxes.project_id and m.user_id=(select auth.uid())));
create policy "admins manage site locations" on public.site_locations for all to authenticated using ((select public.is_rayet_admin())) with check ((select public.is_rayet_admin()));
create policy "admins manage combiner boxes" on public.combiner_boxes for all to authenticated using ((select public.is_rayet_admin())) with check ((select public.is_rayet_admin()));
create policy "admins manage install allocations" on public.install_allocations for all to authenticated using ((select public.is_rayet_admin())) with check ((select public.is_rayet_admin()));
create policy "admins create projects" on public.projects for insert to authenticated with check ((select public.is_rayet_admin()));
create policy "admins edit projects" on public.projects for update to authenticated using ((select public.is_rayet_admin())) with check ((select public.is_rayet_admin()));
create policy "admins manage deliveries" on public.deliveries for all to authenticated using ((select public.is_rayet_admin())) with check ((select public.is_rayet_admin()));
create policy "admins manage inventory pallets" on public.inventory_pallets for all to authenticated using ((select public.is_rayet_admin())) with check ((select public.is_rayet_admin()));
create policy "admins manage inventory panels" on public.inventory_panels for all to authenticated using ((select public.is_rayet_admin())) with check ((select public.is_rayet_admin()));
create policy "members manage recycling loads" on public.recycling_loads for all to authenticated using (exists(select 1 from public.project_members m where m.project_id=recycling_loads.project_id and m.user_id=(select auth.uid()))) with check (created_by=(select auth.uid()) and exists(select 1 from public.project_members m where m.project_id=recycling_loads.project_id and m.user_id=(select auth.uid())));
create policy "members manage removal items" on public.removal_items for all to authenticated using (exists(select 1 from public.project_members m where m.project_id=removal_items.project_id and m.user_id=(select auth.uid()))) with check (removed_by=(select auth.uid()) and exists(select 1 from public.project_members m where m.project_id=removal_items.project_id and m.user_id=(select auth.uid())));
create policy "admins assign users" on public.project_members for insert to authenticated with check ((select public.is_rayet_admin()));
create policy "admins edit assignments" on public.project_members for update to authenticated using ((select public.is_rayet_admin())) with check ((select public.is_rayet_admin()));
create policy "admins remove assignments" on public.project_members for delete to authenticated using ((select public.is_rayet_admin()));
create policy "members or admins view project events" on public.custody_events for select to authenticated using ((select public.is_rayet_admin()) or exists(select 1 from public.project_members m where m.project_id=custody_events.project_id and m.user_id=(select auth.uid())));
create policy "members append their project events" on public.custody_events for insert to authenticated with check (recorded_by=(select auth.uid()) and exists(select 1 from public.project_members m where m.project_id=custody_events.project_id and m.user_id=(select auth.uid())));
