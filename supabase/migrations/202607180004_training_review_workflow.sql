-- T2: review workflow — learner-visible reviews, claim fields, resubmit support.

-- Queue claim lives on the submission until a review is written.
alter table public.training_submissions
  add column if not exists claimed_by uuid references public.profiles(id) on delete set null,
  add column if not exists claimed_at timestamptz;

create index if not exists training_submissions_claimed_by_idx
  on public.training_submissions (claimed_by)
  where claimed_by is not null;

create index if not exists training_submissions_status_updated_idx
  on public.training_submissions (status, updated_at desc);

-- Learners may read reviews for their own submissions (feedback timeline).
drop policy if exists "learners read own reviews" on public.training_reviews;
create policy "learners read own reviews" on public.training_reviews
  for select
  using (
    exists (
      select 1
      from public.training_submissions s
      where s.id = submission_id
        and s.learner_id = auth.uid()
    )
  );

-- Allow staff to re-review after learner resubmits (status must be submitted).
-- Also clear claim when a review is recorded.
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
begin
  if not public.is_staff() then
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
