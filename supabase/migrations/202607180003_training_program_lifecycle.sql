-- T1: training camp lifecycle metadata + enrollment role/status expansion.

-- ── Programs: metadata + status machine ───────────────────────────────
alter table public.training_programs
  add column if not exists cohort_name text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists max_members integer,
  add column if not exists status text not null default 'draft';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'training_programs_status_check'
      and conrelid = 'public.training_programs'::regclass
  ) then
    alter table public.training_programs
      add constraint training_programs_status_check
      check (status in ('draft', 'active', 'archived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'training_programs_max_members_check'
      and conrelid = 'public.training_programs'::regclass
  ) then
    alter table public.training_programs
      add constraint training_programs_max_members_check
      check (max_members is null or max_members > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'training_programs_date_range_check'
      and conrelid = 'public.training_programs'::regclass
  ) then
    alter table public.training_programs
      add constraint training_programs_date_range_check
      check (start_date is null or end_date is null or end_date >= start_date);
  end if;
end $$;

-- ── Enrollments: camp role + soft-remove ────────────────────────────
alter table public.training_enrollments
  add column if not exists role text not null default 'learner';

-- Expand status check to include removed (drop then re-add).
alter table public.training_enrollments drop constraint if exists training_enrollments_status_check;
alter table public.training_enrollments
  add constraint training_enrollments_status_check
  check (status in ('active', 'completed', 'removed'));

alter table public.training_enrollments drop constraint if exists training_enrollments_role_check;
alter table public.training_enrollments
  add constraint training_enrollments_role_check
  check (role in ('learner', 'ta'));

create index if not exists training_programs_status_updated_idx
  on public.training_programs (status, updated_at desc);
create index if not exists training_enrollments_program_status_idx
  on public.training_enrollments (program_id, status);
