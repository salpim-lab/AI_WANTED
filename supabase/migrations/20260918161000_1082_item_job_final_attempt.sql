-- A second/final attempt increments the count to max_attempts when claimed.
-- The previous strict inequality rejected that claim before the worker could run.
begin;
alter table public.item_generation_jobs drop constraint if exists item_generation_jobs_check4;
alter table public.item_generation_jobs drop constraint if exists item_generation_jobs_active_attempts_check;
alter table public.item_generation_jobs add constraint item_generation_jobs_active_attempts_check
  check (status not in ('queued', 'generating') or attempt_count <= max_attempts);
commit;
