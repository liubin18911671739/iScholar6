create unique index if not exists training_submissions_program_task_learner_idx
  on public.training_submissions (program_id, task_id, learner_id);
