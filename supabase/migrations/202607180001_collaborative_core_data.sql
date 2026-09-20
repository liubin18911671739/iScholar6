-- Core project data for collaborative mode.
-- JSONB preserves the flexible browser-local shapes while RLS keeps every
-- project-scoped row private to its owner.

create table if not exists public.projects (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  discipline text,
  goal text,
  status text not null default 'draft',
  encryption_key_ref text,
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.manuscripts (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  title text not null,
  abstract text,
  current_version integer,
  target_journal text,
  status text,
  updated_at timestamptz not null
);
create table if not exists public.manuscript_blocks (
  id text primary key,
  manuscript_id text not null references public.manuscripts(id) on delete cascade,
  section text not null,
  ordinal integer not null default 0,
  content text not null,
  version integer,
  author_type text,
  agent_run_id text,
  updated_at timestamptz not null
);
create table if not exists public.manuscript_versions (
  id text primary key,
  manuscript_id text not null references public.manuscripts(id) on delete cascade,
  block_id text,
  version integer not null,
  content text not null,
  author_type text,
  agent_run_id text,
  created_at timestamptz not null,
  content_hash text not null
);

create table if not exists public.bib_items (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  doi text,
  title text not null,
  authors jsonb,
  year integer,
  venue text,
  abstract text,
  keywords jsonb,
  citation_count integer,
  metadata jsonb,
  created_at timestamptz not null
);
create table if not exists public.attachments (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  bib_item_id text references public.bib_items(id) on delete set null,
  filename text not null,
  storage_path text,
  content_hash text,
  mime_type text,
  size_bytes bigint,
  encrypted boolean,
  created_at timestamptz not null
);
create table if not exists public.rag_chunks (
  id text primary key,
  bib_item_id text not null references public.bib_items(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding_data jsonb
);

create table if not exists public.experiments (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  name text not null,
  dataset text,
  params jsonb,
  results jsonb,
  script_blob_url text,
  created_at timestamptz not null
);
create table if not exists public.submissions (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  manuscript_id text not null references public.manuscripts(id) on delete cascade,
  journal_name text not null,
  cover_letter text,
  file_tree jsonb,
  submitted_at timestamptz,
  status text
);
create table if not exists public.review_rounds (
  id text primary key,
  submission_id text not null references public.submissions(id) on delete cascade,
  round_number integer not null,
  decision text,
  review_text text,
  deadline timestamptz
);
create table if not exists public.rebuttal_items (
  id text primary key,
  review_round_id text not null references public.review_rounds(id) on delete cascade,
  reviewer_comment text not null,
  response text,
  change_location text,
  evidence jsonb
);

create table if not exists public.agent_runs (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  agent text not null,
  status text not null,
  inputs jsonb,
  outputs jsonb,
  model_name text,
  token_in integer,
  token_out integer,
  cost_cents integer,
  latency_ms integer,
  started_at timestamptz not null,
  ended_at timestamptz,
  mode text,
  training_task_id text,
  consent_id text
);
create table if not exists public.audit_ledger (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  agent_run_id text,
  actor text,
  action text not null,
  prompt_hash text,
  input_hash text,
  output_hash text,
  consent_id text,
  parent_hash text,
  timestamp timestamptz not null
);
create table if not exists public.tasks (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  status text,
  assignee text,
  due_date timestamptz,
  created_by text
);

create index if not exists projects_owner_updated_idx on public.projects(owner_id, updated_at desc);
create index if not exists agent_runs_project_started_idx on public.agent_runs(project_id, started_at desc);
create index if not exists audit_ledger_project_timestamp_idx on public.audit_ledger(project_id, timestamp desc);
create index if not exists manuscripts_project_idx on public.manuscripts(project_id);
create index if not exists bib_items_project_idx on public.bib_items(project_id);
create index if not exists tasks_project_idx on public.tasks(project_id);

create or replace function public.owns_project(project text)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.projects where id = project and owner_id = auth.uid()) $$;

alter table public.projects enable row level security;
create policy "owners manage projects" on public.projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'manuscripts','bib_items','attachments','experiments','submissions',
    'agent_runs','audit_ledger','tasks'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy "project owners manage %1$s" on public.%1$I for all using (public.owns_project(project_id)) with check (public.owns_project(project_id))', table_name);
  end loop;
end $$;

alter table public.manuscript_blocks enable row level security;
create policy "project owners manage manuscript blocks" on public.manuscript_blocks for all
  using (exists (select 1 from public.manuscripts m where m.id = manuscript_id and public.owns_project(m.project_id)))
  with check (exists (select 1 from public.manuscripts m where m.id = manuscript_id and public.owns_project(m.project_id)));
alter table public.manuscript_versions enable row level security;
create policy "project owners manage manuscript versions" on public.manuscript_versions for all
  using (exists (select 1 from public.manuscripts m where m.id = manuscript_id and public.owns_project(m.project_id)))
  with check (exists (select 1 from public.manuscripts m where m.id = manuscript_id and public.owns_project(m.project_id)));
alter table public.rag_chunks enable row level security;
create policy "project owners manage rag chunks" on public.rag_chunks for all
  using (exists (select 1 from public.bib_items b where b.id = bib_item_id and public.owns_project(b.project_id)))
  with check (exists (select 1 from public.bib_items b where b.id = bib_item_id and public.owns_project(b.project_id)));
alter table public.review_rounds enable row level security;
create policy "project owners manage review rounds" on public.review_rounds for all
  using (exists (select 1 from public.submissions s where s.id = submission_id and public.owns_project(s.project_id)))
  with check (exists (select 1 from public.submissions s where s.id = submission_id and public.owns_project(s.project_id)));
alter table public.rebuttal_items enable row level security;
create policy "project owners manage rebuttal items" on public.rebuttal_items for all
  using (exists (select 1 from public.review_rounds r join public.submissions s on s.id = r.submission_id where r.id = review_round_id and public.owns_project(s.project_id)))
  with check (exists (select 1 from public.review_rounds r join public.submissions s on s.id = r.submission_id where r.id = review_round_id and public.owns_project(s.project_id)));
