-- LMS platform link per training program (LTI AGS credentials stored server-side only).
-- Full browser LTI launch/OIDC is optional; this powers staff-initiated AGS score push.

create table if not exists public.training_lms_links (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null unique references public.training_programs(id) on delete cascade,
  platform text not null default 'canvas'
    check (platform in ('canvas', 'moodle', 'generic')),
  enabled boolean not null default false,
  issuer text,
  client_id text,
  -- Secret never returned to browser; only service-role / server routes read it.
  client_secret text,
  token_url text,
  ags_lineitem_url text,
  deployment_id text,
  auth_method text not null default 'client_secret_post'
    check (auth_method in ('client_secret_post', 'client_secret_basic', 'private_key_jwt')),
  -- Optional PEM private key for private_key_jwt (server-only).
  private_key_pem text,
  last_push_at timestamptz,
  last_push_status text,
  last_push_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_lms_links_program_idx
  on public.training_lms_links (program_id);

alter table public.training_lms_links enable row level security;

-- Staff who can manage the program may read non-secret columns (use view-like select in API).
drop policy if exists "staff manage lms links" on public.training_lms_links;
create policy "staff manage lms links" on public.training_lms_links
  for all
  using (public.can_manage_program(program_id))
  with check (public.can_manage_program(program_id));

comment on table public.training_lms_links is
  'Per-camp LMS/LTI AGS credentials. Secrets must only be used server-side.';
