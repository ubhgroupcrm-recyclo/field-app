-- Project-specific access roles. Run after 20261113_operator_events.sql.
-- A person can hold different roles on different Rayet projects.
create table if not exists public.project_member_roles (
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 role text not null check(role in ('operative','telehandler_operator','senior_electrician','site_manager')),
 assigned_at timestamptz not null default now(),
 primary key(project_id,user_id,role)
);

-- Preserve access for accounts already assigned to Shoals Hook.
insert into public.project_member_roles(project_id,user_id,role)
select project_id,user_id,'operative' from public.project_members where role='worker'
on conflict do nothing;
insert into public.project_member_roles(project_id,user_id,role)
select project_id,user_id,'site_manager' from public.project_members where role in ('supervisor','admin')
on conflict do nothing;

create or replace function public.has_project_role(p_project_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path=public as $$
 select (select public.is_rayet_admin())
     or exists(select 1 from public.project_member_roles r
               where r.project_id=p_project_id and r.user_id=(select auth.uid())
                 and (r.role=any(p_roles) or r.role='site_manager'));
$$;
grant execute on function public.has_project_role(uuid,text[]) to authenticated;

alter table public.project_member_roles enable row level security;
revoke all on public.project_member_roles from anon,authenticated;
grant select,insert,delete on public.project_member_roles to authenticated;
drop policy if exists "members view project roles" on public.project_member_roles;
drop policy if exists "admins manage project roles" on public.project_member_roles;
create policy "members view project roles" on public.project_member_roles for select to authenticated using (
 user_id=(select auth.uid()) or (select public.is_rayet_admin())
);
create policy "admins manage project roles" on public.project_member_roles for all to authenticated using ((select public.is_rayet_admin())) with check ((select public.is_rayet_admin()));

-- Re-scope field write permissions.
drop policy if exists "members append asset movements" on public.asset_movements;
create policy "members append asset movements" on public.asset_movements for insert to authenticated with check (
 recorded_by=(select auth.uid()) and public.has_project_role(project_id,array['operative'])
);
drop policy if exists "members manage isolation certificates" on public.isolation_certificates;
drop policy if exists "members view isolation certificates" on public.isolation_certificates;
drop policy if exists "qualified users create isolation certificates" on public.isolation_certificates;
create policy "members view isolation certificates" on public.isolation_certificates for select to authenticated using (
 exists(select 1 from public.project_members m where m.project_id=isolation_certificates.project_id and m.user_id=(select auth.uid()))
);
create policy "qualified users create isolation certificates" on public.isolation_certificates for insert to authenticated with check (
 created_by=(select auth.uid()) and public.has_project_role(project_id,array['senior_electrician'])
);
