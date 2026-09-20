-- Camp-scoped AI / training consent audit fields.
-- Enables staff/TA to verify learners confirmed redaction before external AI or camp submit.

alter table public.ai_consents
  add column if not exists program_id uuid references public.training_programs(id) on delete set null;

alter table public.ai_consents
  add column if not exists training_task_id text;

alter table public.ai_consents
  add column if not exists purpose text not null default 'agent_run'
    check (purpose in ('agent_run', 'training_submit', 'mcp_tool', 'export'));

alter table public.ai_consents
  add column if not exists sensitive_scan jsonb not null default '{}'::jsonb;

create index if not exists ai_consents_program_id_idx
  on public.ai_consents (program_id, consented_at desc);

create index if not exists ai_consents_user_project_idx
  on public.ai_consents (user_id, project_id, consented_at desc);

-- Staff / camp TA may read consent proofs for audit (no write beyond own rows).
drop policy if exists "staff or ta read camp consents" on public.ai_consents;
create policy "staff or ta read camp consents" on public.ai_consents
  for select
  using (
    user_id = auth.uid()
    or public.is_staff()
    or (
      program_id is not null
      and public.is_program_ta(program_id)
    )
  );

comment on column public.ai_consents.program_id is
  'Optional training program for camp-level consent audit.';
comment on column public.ai_consents.purpose is
  'agent_run | training_submit | mcp_tool | export';
comment on column public.ai_consents.sensitive_scan is
  'Counts-only sensitive scan summary at consent time (no raw PII).';
