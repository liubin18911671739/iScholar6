-- P2-C: peer review (one anonymous round per submission) + parallel peer_status

alter table public.training_submissions
  add column if not exists peer_status text
    check (peer_status is null or peer_status in (
      'none', 'awaiting_peer', 'peer_done', 'peer_skipped'
    ));

-- Peer reviewers may read the assigned submission (not write).
drop policy if exists "peer reviewer read assigned submission" on public.training_submissions;
create policy "peer reviewer read assigned submission" on public.training_submissions
  for select
  using (
    exists (
      select 1 from public.training_peer_assignments a
      where a.submission_id = training_submissions.id
        and a.reviewer_learner_id = auth.uid()
    )
  );

drop policy if exists "peer reviewer read evidence" on public.evidence_cards;
create policy "peer reviewer read evidence" on public.evidence_cards
  for select
  using (
    exists (
      select 1 from public.training_peer_assignments a
      where a.submission_id::text = evidence_cards.submission_id
        and a.reviewer_learner_id = auth.uid()
    )
  );

create table if not exists public.training_peer_assignments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.training_submissions(id) on delete cascade,
  program_id uuid not null references public.training_programs(id) on delete cascade,
  reviewer_learner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'skipped', 'expired')),
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  completed_at timestamptz,
  unique (submission_id)
);

create index if not exists training_peer_assignments_reviewer_idx
  on public.training_peer_assignments (reviewer_learner_id, status);

create index if not exists training_peer_assignments_program_idx
  on public.training_peer_assignments (program_id, status);

create table if not exists public.training_peer_reviews (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.training_peer_assignments(id) on delete cascade,
  decision text not null check (decision in ('approved', 'needs_revision')),
  score integer check (score is null or (score >= 0 and score <= 100)),
  feedback text,
  evidence_card_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.training_peer_assignments enable row level security;
alter table public.training_peer_reviews enable row level security;

-- Assignments: reviewer sees own pending/completed; staff/TA of program; author never sees reviewer identity via select of reviewer_id for peers — they can see assignment exists only via staff.
drop policy if exists "peer assignment access" on public.training_peer_assignments;
create policy "peer assignment access" on public.training_peer_assignments
  for select
  using (
    reviewer_learner_id = auth.uid()
    or public.is_staff()
    or public.is_program_ta(program_id)
  );

drop policy if exists "staff manage peer assignments" on public.training_peer_assignments;
create policy "staff manage peer assignments" on public.training_peer_assignments
  for all
  using (public.is_staff() or public.is_program_ta(program_id))
  with check (public.is_staff() or public.is_program_ta(program_id));

-- Learners insert only via service/API using their JWT as assignee updater
drop policy if exists "reviewer update own assignment" on public.training_peer_assignments;
create policy "reviewer update own assignment" on public.training_peer_assignments
  for update
  using (reviewer_learner_id = auth.uid())
  with check (reviewer_learner_id = auth.uid());

drop policy if exists "peer review access" on public.training_peer_reviews;
create policy "peer review access" on public.training_peer_reviews
  for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.training_peer_assignments a
      where a.id = assignment_id
        and (
          a.reviewer_learner_id = auth.uid()
          or public.is_program_ta(a.program_id)
        )
    )
  );

drop policy if exists "reviewer write peer review" on public.training_peer_reviews;
create policy "reviewer write peer review" on public.training_peer_reviews
  for insert
  with check (
    exists (
      select 1 from public.training_peer_assignments a
      where a.id = assignment_id
        and a.reviewer_learner_id = auth.uid()
        and a.status = 'pending'
    )
  );

-- Authors (or any enrolled member) may create an assignment row when submitting.
drop policy if exists "enrolled create peer assignment" on public.training_peer_assignments;
create policy "enrolled create peer assignment" on public.training_peer_assignments
  for insert
  with check (
    public.is_staff()
    or exists (
      select 1 from public.training_enrollments e
      where e.program_id = training_peer_assignments.program_id
        and e.learner_id = auth.uid()
        and e.status <> 'removed'
    )
  );

-- Atomic complete: peer review + assignment + peer_status (bypasses submission update RLS).
create or replace function public.complete_peer_review(
  p_assignment_id uuid,
  p_decision text,
  p_feedback text default null,
  p_score integer default null,
  p_evidence_card_ids text[] default '{}'
) returns public.training_peer_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.training_peer_assignments;
  v_review public.training_peer_reviews;
begin
  select * into v_assignment
  from public.training_peer_assignments
  where id = p_assignment_id
  for update;

  if v_assignment.id is null then
    raise exception 'ASSIGNMENT_NOT_FOUND';
  end if;
  if v_assignment.reviewer_learner_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;
  if v_assignment.status <> 'pending' then
    raise exception 'ASSIGNMENT_NOT_PENDING';
  end if;
  if p_decision not in ('approved', 'needs_revision') then
    raise exception 'INVALID_DECISION';
  end if;

  insert into public.training_peer_reviews (
    assignment_id, decision, feedback, score, evidence_card_ids
  ) values (
    p_assignment_id, p_decision, p_feedback, p_score, coalesce(p_evidence_card_ids, '{}')
  )
  returning * into v_review;

  update public.training_peer_assignments
  set status = 'completed', completed_at = now()
  where id = p_assignment_id;

  update public.training_submissions
  set peer_status = 'peer_done', updated_at = now()
  where id = v_assignment.submission_id;

  return v_review;
end;
$$;

grant execute on function public.complete_peer_review(uuid, text, text, integer, text[]) to authenticated;

comment on column public.training_submissions.peer_status is
  'Parallel peer workflow: none|awaiting_peer|peer_done|peer_skipped (does not block staff review).';

-- Enable Realtime for ops toasts (Dashboard: Database → Replication if not auto).
-- alter publication supabase_realtime add table public.training_submissions;
-- alter publication supabase_realtime add table public.training_reviews;
