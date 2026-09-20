drop policy if exists "staff update submissions" on public.training_submissions;
create policy "staff update submissions" on public.training_submissions
for update using (public.is_staff()) with check (public.is_staff());
