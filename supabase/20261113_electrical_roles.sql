-- Run once in Supabase SQL Editor (Run without RLS).
-- Align electrical permissions with certificate responsibilities.
alter table public.project_member_roles drop constraint if exists project_member_roles_role_check;
update public.project_member_roles set role='authorised_person' where role='senior_electrician';
alter table public.project_member_roles add constraint project_member_roles_role_check check (
  role in ('operative','telehandler_operator','competent_person','authorised_person','site_manager')
);

create or replace function public.is_project_site_manager(p_project_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select (select public.is_rayet_admin()) or exists(
    select 1 from public.project_member_roles
    where project_id=p_project_id and user_id=(select auth.uid()) and role='site_manager'
  )
$$;
grant execute on function public.is_project_site_manager(uuid) to authenticated;

drop policy if exists "members view project roles" on public.project_member_roles;
create policy "members view project roles" on public.project_member_roles for select to authenticated using (
  user_id=(select auth.uid()) or (select public.is_rayet_admin())
  or public.is_project_site_manager(project_id)
  or public.has_project_role(project_id,array['authorised_person'])
);

drop policy if exists "users or admins view profiles" on public.profiles;
create policy "users or admins view profiles" on public.profiles for select to authenticated using (
  id=(select auth.uid()) or (select public.is_rayet_admin()) or exists(
    select 1 from public.project_members mine join public.project_members theirs on theirs.project_id=mine.project_id
    where mine.user_id=(select auth.uid()) and theirs.user_id=profiles.id
  )
);

drop policy if exists "qualified users create isolation certificates" on public.isolation_certificates;
create policy "qualified users create isolation certificates" on public.isolation_certificates for insert to authenticated with check (
  created_by=(select auth.uid()) and public.has_project_role(project_id,array['authorised_person'])
);
