-- Run once in Supabase SQL Editor (Run without RLS).
create table if not exists public.checklist_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  checklist_type text not null check (checklist_type in ('pallet_delivery','panel_visual','telehandler_pre_use')),
  asset_code text not null,
  responses jsonb not null default '{}'::jsonb,
  outcome text not null check (outcome in ('passed','failed','out_of_service')),
  notes text,
  signature_data text not null,
  signed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists checklist_submissions_project_idx on public.checklist_submissions(project_id,checklist_type,created_at desc);
alter table public.checklist_submissions enable row level security;
revoke all on public.checklist_submissions from anon,authenticated;
grant select,insert on public.checklist_submissions to authenticated;
drop policy if exists "members view checklists" on public.checklist_submissions;
drop policy if exists "operators submit checklists" on public.checklist_submissions;
create policy "members view checklists" on public.checklist_submissions for select to authenticated using (
  exists(select 1 from public.project_members m where m.project_id=checklist_submissions.project_id and m.user_id=(select auth.uid()))
);
create policy "operators submit checklists" on public.checklist_submissions for insert to authenticated with check (
  signed_by=(select auth.uid()) and public.has_project_role(project_id,array['operative','telehandler_operator'])
);
