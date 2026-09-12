-- Single JSONB blob per user for syncing the app's local Zustand store.
-- Not wired up to the app yet (Phase 1 only adds auth); this just prepares
-- the storage target for a later sync phase.

create table if not exists public.user_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.user_data enable row level security;

create policy "Users can select their own row"
  on public.user_data for select
  using (auth.uid() = user_id);

create policy "Users can insert their own row"
  on public.user_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own row"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at current on every write.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_data_set_updated_at
  before update on public.user_data
  for each row
  execute function public.set_updated_at();
