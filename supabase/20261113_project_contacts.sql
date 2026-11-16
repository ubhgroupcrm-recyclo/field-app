-- Run once in Supabase SQL Editor (Run without RLS).
-- Project-manager details are contact data, not access roles.
alter table public.projects add column if not exists project_manager_name text;
alter table public.projects add column if not exists project_manager_email text;
alter table public.projects add column if not exists project_manager_mobile text;
alter table public.projects add column if not exists project_address text;
alter table public.projects add column if not exists what3words text;