-- T3: per-camp task curriculum (selection, order, due dates, review override).

create table if not exists public.training_program_tasks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  task_id text not null,
  ordinal integer not null default 0,
  due_at timestamptz,
  required boolean not null default true,
  requires_review_override boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, task_id)
);

create index if not exists training_program_tasks_program_ordinal_idx
  on public.training_program_tasks (program_id, ordinal);

alter table public.training_program_tasks enable row level security;

drop policy if exists "staff manage program tasks" on public.training_program_tasks;
create policy "staff manage program tasks" on public.training_program_tasks
  for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "members read program tasks" on public.training_program_tasks;
create policy "members read program tasks" on public.training_program_tasks
  for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.training_enrollments e
      where e.program_id = training_program_tasks.program_id
        and e.learner_id = auth.uid()
        and e.status <> 'removed'
    )
  );

-- Optional staff nudge timestamp per enrollment (lightweight deadline reminder).
alter table public.training_enrollments
  add column if not exists last_nudged_at timestamptz;
