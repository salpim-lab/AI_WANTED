-- 워커가 에셋을 만들었지만 student_items 지급 전인 중간 상태
do $$ declare c record; begin
  for c in select conname from pg_constraint
    where conrelid = 'public.item_generation_jobs'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%fallback_final%' loop
    execute format('alter table public.item_generation_jobs drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.item_generation_jobs add constraint item_generation_jobs_status_check
  check (status in ('queued', 'generating', 'retry_wait', 'fallback', 'asset_ready', 'completed', 'fallback_final'));

do $$ declare c record; begin
  for c in select conname from pg_constraint
    where conrelid = 'public.item_generation_jobs'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%generated_asset_id%' loop
    execute format('alter table public.item_generation_jobs drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.item_generation_jobs add constraint item_generation_jobs_generated_asset_check
  check (status not in ('completed', 'asset_ready') or generated_asset_id is not null);

comment on column public.item_generation_jobs.status is
  'asset_ready는 절차적 에셋 저장 완료·학생 지급 전이다. fallback과 generated는 상담별 같은 asset_catalog 행을 갱신할 수 있다.';
