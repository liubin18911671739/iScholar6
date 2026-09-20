-- Camp-level teaching assistant (enrollment.role = 'ta') permissions.
-- TA may review / read operational data for their camps.
-- TA may NOT create/delete/archive programs, invite/remove members, or edit curriculum.

create or replace function public.is_program_ta(p_program uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.training_enrollments e
    where e.program_id = p_program
      and e.learner_id = auth.uid()
      and e.role = 'ta'
      and e.status = 'active'
  );
$$;

create or replace function public.is_staff_or_program_ta(p_program uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff() or public.is_program_ta(p_program);
$$;

-- Submission belongs to a program the current user TAs.
create or replace function public.is_ta_for_submission(p_submission uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.training_submissions s
    join public.training_enrollments e
      on e.program_id = s.program_id
     and e.learner_id = auth.uid()
     and e.role = 'ta'
     and e.status = 'active'
    where s.id = p_submission
  );
$$;

-- ── Programs: TA can read camps they assist ────────────────────────────
-- Existing "program members can read" already covers enrolled TAs.

-- ── Enrollments: TA can read classmates in their camp ──────────────────
drop policy if exists "ta read camp enrollments" on public.training_enrollments;
create policy "ta read camp enrollments" on public.training_enrollments
  for select
  using (public.is_program_ta(program_id));

-- ── Submissions: TA can read + claim (update claimed_*) in their camp ──
drop policy if exists "ta read camp submissions" on public.training_submissions;
create policy "ta read camp submissions" on public.training_submissions
  for select
  using (public.is_program_ta(program_id));

drop policy if exists "ta claim camp submissions" on public.training_submissions;
create policy "ta claim camp submissions" on public.training_submissions
  for update
  using (public.is_program_ta(program_id))
  with check (public.is_program_ta(program_id));

-- ── Reviews: TA can insert/select reviews for camp submissions ─────────
drop policy if exists "ta read camp reviews" on public.training_reviews;
create policy "ta read camp reviews" on public.training_reviews
  for select
  using (public.is_ta_for_submission(submission_id));

drop policy if exists "ta write camp reviews" on public.training_reviews;
create policy "ta write camp reviews" on public.training_reviews
  for insert
  with check (
    reviewer_id = auth.uid()
    and public.is_ta_for_submission(submission_id)
  );

-- ── Program tasks: TA can read curriculum (not write — staff only) ─────
-- Existing "members read program tasks" already covers enrolled TAs.

-- ── Evidence cards: TA can read evidence for camp submissions ──────────
-- evidence_cards are project-scoped; staff policy already allows is_staff().
-- Allow TA to read all evidence_cards for submissions in their programs when
-- submission_id matches a camp submission they can see.
drop policy if exists "ta read camp evidence cards" on public.evidence_cards;
create policy "ta read camp evidence cards" on public.evidence_cards
  for select
  using (
    public.is_staff()
    or exists (
      select 1
      from public.training_submissions s
      where s.id::text = evidence_cards.submission_id
        and public.is_program_ta(s.program_id)
    )
  );

-- ── Review RPC: staff OR TA of the submission's program ────────────────
create or replace function public.review_training_submission(
  p_submission_id uuid,
  p_decision text,
  p_feedback text default null,
  p_score integer default null
) returns public.training_reviews
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_review public.training_reviews;
  v_program uuid;
begin
  select s.program_id into v_program
  from public.training_submissions s
  where s.id = p_submission_id;

  if v_program is null then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;

  if not (public.is_staff() or public.is_program_ta(v_program)) then
    raise exception 'FORBIDDEN';
  end if;
  if p_decision not in ('approved', 'needs_revision', 'escalated') then
    raise exception 'INVALID_REVIEW';
  end if;
  if p_score is not null and (p_score < 0 or p_score > 100) then
    raise exception 'INVALID_SCORE';
  end if;

  update public.training_submissions
  set status = case
        when p_decision = 'approved' then 'completed'
        when p_decision = 'escalated' then 'escalated'
        else 'needs_review'
      end,
      updated_at = now(),
      claimed_by = null,
      claimed_at = null
  where id = p_submission_id and status = 'submitted';
  if not found then raise exception 'SUBMISSION_NOT_PENDING'; end if;

  insert into public.training_reviews (submission_id, reviewer_id, decision, feedback, score)
  values (p_submission_id, auth.uid(), p_decision, p_feedback, p_score)
  returning * into v_review;
  return v_review;
end;
$$;

comment on function public.is_program_ta(uuid) is
  'True when auth.uid() is an active teaching assistant (enrollment.role=ta) for the program.';
comment on function public.is_staff_or_program_ta(uuid) is
  'True when auth.uid() is global staff or camp TA for the program.';
