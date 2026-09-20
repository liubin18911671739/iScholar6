create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'learner' check (role in ('learner', 'librarian', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email)) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create table if not exists public.training_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  discipline text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_enrollments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed')),
  joined_at timestamptz not null default now(),
  unique (program_id, learner_id)
);

create table if not exists public.training_submissions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  task_id text not null,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  reflection text,
  status text not null default 'submitted',
  updated_at timestamptz not null default now()
);

create table if not exists public.training_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.training_submissions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('approved', 'needs_revision', 'escalated')),
  feedback text,
  score integer check (score between 0 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_consents (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  external_services text[] not null default '{}',
  redaction_confirmed boolean not null default false,
  consented_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.training_programs enable row level security;
alter table public.training_enrollments enable row level security;
alter table public.training_submissions enable row level security;
alter table public.training_reviews enable row level security;
alter table public.ai_consents enable row level security;

create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('librarian', 'admin'));
$$;

drop policy if exists "profiles self or staff" on public.profiles;
drop policy if exists "program members can read" on public.training_programs;
drop policy if exists "staff manage programs" on public.training_programs;
drop policy if exists "members read enrollments" on public.training_enrollments;
drop policy if exists "staff manage enrollments" on public.training_enrollments;
drop policy if exists "learners submit and staff read" on public.training_submissions;
drop policy if exists "learners create own submissions" on public.training_submissions;
drop policy if exists "learners update own submissions" on public.training_submissions;
drop policy if exists "staff update submissions" on public.training_submissions;
drop policy if exists "staff manage reviews" on public.training_reviews;
drop policy if exists "users manage own ai consent" on public.ai_consents;

create policy "profiles self or staff" on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy "program members can read" on public.training_programs for select using (
  owner_id = auth.uid() or public.is_staff() or exists (select 1 from public.training_enrollments e where e.program_id = id and e.learner_id = auth.uid())
);
create policy "staff manage programs" on public.training_programs for all using (public.is_staff() or owner_id = auth.uid()) with check (public.is_staff() or owner_id = auth.uid());
create policy "members read enrollments" on public.training_enrollments for select using (learner_id = auth.uid() or public.is_staff());
create policy "staff manage enrollments" on public.training_enrollments for all using (public.is_staff()) with check (public.is_staff());
create policy "learners submit and staff read" on public.training_submissions for select using (learner_id = auth.uid() or public.is_staff());
create policy "learners create own submissions" on public.training_submissions for insert with check (learner_id = auth.uid());
create policy "learners update own submissions" on public.training_submissions for update using (learner_id = auth.uid()) with check (learner_id = auth.uid());
create policy "staff update submissions" on public.training_submissions for update using (public.is_staff()) with check (public.is_staff());
create policy "staff manage reviews" on public.training_reviews for all using (public.is_staff()) with check (public.is_staff() and reviewer_id = auth.uid());
create policy "users manage own ai consent" on public.ai_consents for all using (user_id = auth.uid()) with check (user_id = auth.uid());

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
  set status = case when p_decision = 'approved' then 'completed' else 'needs_review' end,
      updated_at = now()
  where id = p_submission_id and status = 'submitted';
  if not found then raise exception 'SUBMISSION_NOT_PENDING'; end if;

  insert into public.training_reviews (submission_id, reviewer_id, decision, feedback, score)
  values (p_submission_id, auth.uid(), p_decision, p_feedback, p_score)
  returning * into v_review;
  return v_review;
end;
$$;
