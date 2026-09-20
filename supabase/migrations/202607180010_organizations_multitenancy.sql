-- P2-G: multi-tenant organization isolation for training camps.
-- Global admin (profiles.role = admin) sees all orgs.
-- Librarian staff is scoped via organization_members.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'librarian'
    check (role in ('org_admin', 'librarian', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists organization_members_user_idx
  on public.organization_members (user_id);

alter table public.training_programs
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

alter table public.training_task_packs
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

alter table public.profiles
  add column if not exists default_org_id uuid references public.organizations(id) on delete set null;

-- Seed default org and backfill existing camps.
insert into public.organizations (id, name, slug)
select gen_random_uuid(), 'Default', 'default'
where not exists (select 1 from public.organizations where slug = 'default');

update public.training_programs p
set organization_id = o.id
from public.organizations o
where o.slug = 'default'
  and p.organization_id is null;

-- Enroll existing librarians/admins into default org.
insert into public.organization_members (org_id, user_id, role)
select o.id, pr.id,
  case when pr.role = 'admin' then 'org_admin' else 'librarian' end
from public.profiles pr
cross join public.organizations o
where o.slug = 'default'
  and pr.role in ('librarian', 'admin')
on conflict (org_id, user_id) do nothing;

update public.profiles pr
set default_org_id = o.id
from public.organizations o
where o.slug = 'default'
  and pr.default_org_id is null
  and pr.role in ('librarian', 'admin');

create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Org staff: membership role org_admin/librarian, or global admin.
create or replace function public.is_org_staff(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_global_admin()
    or exists (
      select 1
      from public.organization_members m
      where m.org_id = p_org
        and m.user_id = auth.uid()
        and m.role in ('org_admin', 'librarian')
    );
$$;

create or replace function public.can_manage_program(p_program uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.training_programs p
    where p.id = p_program
      and (
        public.is_global_admin()
        or p.owner_id = auth.uid()
        or (p.organization_id is not null and public.is_org_staff(p.organization_id))
        -- Legacy: programs without org still allow classic is_staff
        or (p.organization_id is null and public.is_staff())
      )
  );
$$;

create or replace function public.can_read_program(p_program uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.training_programs p
    where p.id = p_program
      and (
        public.can_manage_program(p.id)
        or public.is_program_ta(p.id)
        or exists (
          select 1 from public.training_enrollments e
          where e.program_id = p.id
            and e.learner_id = auth.uid()
            and e.status <> 'removed'
        )
      )
  );
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

drop policy if exists "members read orgs" on public.organizations;
create policy "members read orgs" on public.organizations
  for select
  using (
    public.is_global_admin()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = id and m.user_id = auth.uid()
    )
  );

drop policy if exists "admin manage orgs" on public.organizations;
create policy "admin manage orgs" on public.organizations
  for all
  using (public.is_global_admin())
  with check (public.is_global_admin());

drop policy if exists "members read org membership" on public.organization_members;
create policy "members read org membership" on public.organization_members
  for select
  using (
    user_id = auth.uid()
    or public.is_global_admin()
    or public.is_org_staff(org_id)
  );

drop policy if exists "org admin manage members" on public.organization_members;
create policy "org admin manage members" on public.organization_members
  for all
  using (
    public.is_global_admin()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = organization_members.org_id
        and m.user_id = auth.uid()
        and m.role = 'org_admin'
    )
  )
  with check (
    public.is_global_admin()
    or exists (
      select 1 from public.organization_members m
      where m.org_id = organization_members.org_id
        and m.user_id = auth.uid()
        and m.role = 'org_admin'
    )
  );

-- Tighten training_programs policies for org scope.
drop policy if exists "program members can read" on public.training_programs;
create policy "program members can read" on public.training_programs
  for select
  using (public.can_read_program(id));

drop policy if exists "staff manage programs" on public.training_programs;
create policy "staff manage programs" on public.training_programs
  for all
  using (public.can_manage_program(id) or owner_id = auth.uid())
  with check (
    public.is_global_admin()
    or owner_id = auth.uid()
    or (organization_id is not null and public.is_org_staff(organization_id))
    or (organization_id is null and public.is_staff())
  );

-- Enrollments: staff scoped to program org.
drop policy if exists "staff manage enrollments" on public.training_enrollments;
create policy "staff manage enrollments" on public.training_enrollments
  for all
  using (public.can_manage_program(program_id))
  with check (public.can_manage_program(program_id));

drop policy if exists "members read enrollments" on public.training_enrollments;
create policy "members read enrollments" on public.training_enrollments
  for select
  using (
    learner_id = auth.uid()
    or public.can_manage_program(program_id)
    or public.is_program_ta(program_id)
  );

-- Submissions staff paths
drop policy if exists "learners submit and staff read" on public.training_submissions;
create policy "learners submit and staff read" on public.training_submissions
  for select
  using (
    learner_id = auth.uid()
    or public.can_manage_program(program_id)
    or public.is_program_ta(program_id)
    or exists (
      select 1 from public.training_peer_assignments a
      where a.submission_id = training_submissions.id
        and a.reviewer_learner_id = auth.uid()
    )
  );

drop policy if exists "staff update submissions" on public.training_submissions;
create policy "staff update submissions" on public.training_submissions
  for update
  using (public.can_manage_program(program_id) or public.is_program_ta(program_id))
  with check (public.can_manage_program(program_id) or public.is_program_ta(program_id));

drop policy if exists "staff manage reviews" on public.training_reviews;
create policy "staff manage reviews" on public.training_reviews
  for all
  using (
    public.is_global_admin()
    or exists (
      select 1 from public.training_submissions s
      where s.id = submission_id
        and (
          public.can_manage_program(s.program_id)
          or public.is_program_ta(s.program_id)
        )
    )
  )
  with check (
    reviewer_id = auth.uid()
    and (
      public.is_global_admin()
      or exists (
        select 1 from public.training_submissions s
        where s.id = submission_id
          and (
            public.can_manage_program(s.program_id)
            or public.is_program_ta(s.program_id)
          )
      )
    )
  );

-- Task packs: org-scoped write, global read for enrolled (catalog).
drop policy if exists "staff manage task packs" on public.training_task_packs;
create policy "staff manage task packs" on public.training_task_packs
  for all
  using (
    public.is_global_admin()
    or (organization_id is not null and public.is_org_staff(organization_id))
    or (organization_id is null and public.is_staff())
  )
  with check (
    public.is_global_admin()
    or (organization_id is not null and public.is_org_staff(organization_id))
    or (organization_id is null and public.is_staff())
  );

comment on table public.organizations is 'Tenant / department boundary for training camps.';
comment on function public.is_org_staff(uuid) is
  'True when auth.uid() is global admin or org_admin/librarian of the organization.';
