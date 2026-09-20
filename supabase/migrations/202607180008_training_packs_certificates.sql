-- P2-B: custom training task packs
-- P2-D: completion certificates

create table if not exists public.training_task_packs (
  id uuid primary key default gen_random_uuid(),
  pack_key text not null,
  name text not null,
  description text,
  version text not null default '1.0.0',
  source text not null default 'upload'
    check (source in ('builtin', 'upload', 'plugin')),
  manifest jsonb not null,
  content_hash text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pack_key)
);

create table if not exists public.training_task_definitions (
  id text primary key,
  pack_id uuid references public.training_task_packs(id) on delete cascade,
  title text not null,
  description text not null default '',
  agent text not null,
  dimension text not null,
  steps jsonb not null default '[]'::jsonb,
  requires_review boolean not null default false,
  peer_review boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists training_task_definitions_pack_id_idx
  on public.training_task_definitions (pack_id);

create table if not exists public.training_certificates (
  id text primary key,
  program_id uuid not null references public.training_programs(id) on delete cascade,
  learner_id uuid not null references auth.users(id) on delete cascade,
  content_hash text not null unique,
  payload jsonb not null,
  issued_at timestamptz not null default now(),
  unique (program_id, learner_id)
);

create index if not exists training_certificates_program_idx
  on public.training_certificates (program_id, issued_at desc);

alter table public.training_task_packs enable row level security;
alter table public.training_task_definitions enable row level security;
alter table public.training_certificates enable row level security;

drop policy if exists "staff manage task packs" on public.training_task_packs;
create policy "staff manage task packs" on public.training_task_packs
  for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "members read task packs" on public.training_task_packs;
create policy "members read task packs" on public.training_task_packs
  for select
  using (true);

drop policy if exists "staff manage task definitions" on public.training_task_definitions;
create policy "staff manage task definitions" on public.training_task_definitions
  for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "members read task definitions" on public.training_task_definitions;
create policy "members read task definitions" on public.training_task_definitions
  for select
  using (true);

drop policy if exists "learners read own certificates" on public.training_certificates;
create policy "learners read own certificates" on public.training_certificates
  for select
  using (learner_id = auth.uid() or public.is_staff());

drop policy if exists "staff or self insert certificates" on public.training_certificates;
create policy "staff or self insert certificates" on public.training_certificates
  for insert
  with check (learner_id = auth.uid() or public.is_staff());

comment on table public.training_task_packs is
  'Custom training task packs (JSON manifest); expands beyond builtin 8 tasks.';
comment on table public.training_certificates is
  'Camp completion certificates with SHA-256 content_hash for offline verify.';
