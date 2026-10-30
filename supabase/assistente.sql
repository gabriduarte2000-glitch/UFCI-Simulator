-- Limite diário de perguntas ao assistente. Rode uma vez no SQL Editor.

create table if not exists public.assistant_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (user_id, day)
);

alter table public.assistant_usage enable row level security;
-- sem políticas: só a função de servidor (service role) escreve e lê.

create or replace function public.assistant_hit(p_user uuid, p_day date, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare used int;
begin
  insert into public.assistant_usage as u (user_id, day, n) values (p_user, p_day, 1)
  on conflict (user_id, day) do update set n = u.n + 1
  returning u.n into used;
  return used <= p_limit;
end $$;

revoke all on function public.assistant_hit(uuid, date, int) from public, anon, authenticated;
grant execute on function public.assistant_hit(uuid, date, int) to service_role;
