-- Run once in Supabase SQL Editor (Run without RLS).
-- Member is an account classification, not an operational field role.
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role='member' where role in ('worker','supervisor');
alter table public.profiles alter column role set default 'member';
alter table public.profiles add constraint profiles_role_check check(role in ('member','admin'));
