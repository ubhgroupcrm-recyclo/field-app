-- Run once in Supabase SQL Editor (Run without RLS).
-- Creates a normal worker profile for each existing/new Supabase Auth user.
-- A Rayet Administrator may later promote a profile to the global admin role.

insert into public.profiles(id,staff_id,display_name,role)
select
  u.id,
  lower(split_part(u.email,'@',1)) || '-' || left(u.id::text,6),
  coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''), initcap(split_part(u.email,'@',1))),
  'member'
from auth.users u
where not exists(select 1 from public.profiles p where p.id=u.id)
on conflict (id) do nothing;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,staff_id,display_name,role)
  values (
    new.id,
    lower(split_part(new.email,'@',1)) || '-' || left(new.id::text,6),
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''), initcap(split_part(new.email,'@',1))),
    'member'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- Only an existing Rayet Administrator can promote/demote global administrators.
grant update on public.profiles to authenticated;
drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles" on public.profiles
  for update to authenticated
  using ((select public.is_rayet_admin()))
  with check ((select public.is_rayet_admin()));
