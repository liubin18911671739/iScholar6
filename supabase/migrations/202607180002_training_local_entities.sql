alter table public.ai_consents add column if not exists data_categories text[] not null default '{}';

create table if not exists public.training_tasks (
  id text primary key,
  program_id uuid references public.training_programs(id) on delete cascade,
  project_id text not null,
  title text not null,
  description text not null,
  agent text,
  dimension text not null,
  steps jsonb not null default '[]'::jsonb,
  status text not null default 'not_started',
  requires_review boolean,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create table if not exists public.evidence_cards (
  id text primary key,
  submission_id text not null,
  project_id text not null,
  claim text not null,
  source_excerpt text,
  source_url text,
  bib_item_id text,
  verification_status text not null,
  evidence_strength text,
  user_note text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
alter table public.training_tasks enable row level security;
alter table public.evidence_cards enable row level security;
create policy "users manage training tasks" on public.training_tasks for all using (public.owns_project(project_id) or public.is_staff()) with check (public.owns_project(project_id) or public.is_staff());
create policy "users manage evidence cards" on public.evidence_cards for all using (public.owns_project(project_id) or public.is_staff()) with check (public.owns_project(project_id) or public.is_staff());
