-- UFCI Simulator: projetos na nuvem. Rode uma vez no SQL Editor do Supabase.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default 'Novo projeto',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_data_size check (pg_column_size(data) < 4000000)
);

create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

create policy "projects_select_own" on public.projects for select to authenticated using (user_id = (select auth.uid()));
create policy "projects_insert_own" on public.projects for insert to authenticated with check (user_id = (select auth.uid()));
create policy "projects_update_own" on public.projects for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "projects_delete_own" on public.projects for delete to authenticated using (user_id = (select auth.uid()));
