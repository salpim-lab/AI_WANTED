-- 상담 아이템 생성 작업과 제한된 fallback 재시도 상태
-- 2026-09-17: 작업당 AI 시도 최대 2회. 기존 불변 student_items는 수정하지 않는다.

create table public.item_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id),
  source_session_id uuid not null unique references public.checkin_sessions(id),
  -- item_candidates는 일부 원격 DB에 아직 없을 수 있어 초기에는 값만 보관한다.
  -- 아래 조건부 FK가 테이블이 존재할 때만 무결성을 추가한다.
  candidate_id uuid unique,
  status text not null default 'queued'
    check (status in ('queued', 'generating', 'retry_wait', 'fallback', 'completed', 'fallback_final')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 2),
  max_attempts smallint not null default 2 check (max_attempts between 1 and 2),
  next_attempt_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  fallback_asset_id uuid references public.asset_catalog(id),
  generated_asset_id uuid references public.asset_catalog(id),
  student_item_id uuid references public.student_items(id),
  started_at timestamptz,
  fallback_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('fallback', 'fallback_final') or fallback_asset_id is not null),
  check (status <> 'completed' or generated_asset_id is not null),
  check (status not in ('completed', 'fallback_final') or student_item_id is not null),
  check (status <> 'retry_wait' or next_attempt_at is not null),
  check (status not in ('queued', 'generating') or attempt_count < max_attempts),
  check (generated_asset_id is null or fallback_asset_id is null or generated_asset_id <> fallback_asset_id)
);

create index item_generation_jobs_claim_idx
  on public.item_generation_jobs(status, next_attempt_at, created_at)
  where status in ('queued', 'retry_wait');

create index item_generation_jobs_enrollment_idx
  on public.item_generation_jobs(enrollment_id, created_at desc);

comment on table public.item_generation_jobs is
  '상담별 3D 아이템 생성 작업. AI 시도는 max_attempts(기본 2회)까지만 허용하며 fallback은 생성 실패 때만 사용한다.';
comment on column public.item_generation_jobs.fallback_asset_id is
  'AI를 호출하지 않는 결정적 대체 아이템. fallback 상태에서만 채운다.';
comment on column public.item_generation_jobs.generated_asset_id is
  '상담 기반으로 성공한 최종 에셋. fallback을 새 student_items 행으로 추가하지 않는다.';

do $$
begin
  if to_regclass('public.item_candidates') is not null then
    alter table public.item_generation_jobs
      add constraint item_generation_jobs_candidate_id_fkey
      foreign key (candidate_id) references public.item_candidates(id);
  end if;
end
$$;

alter table public.item_generation_jobs enable row level security;
create policy item_generation_jobs_read on public.item_generation_jobs
for select to authenticated using (
  public.is_enrollment_student(enrollment_id)
  or public.is_enrollment_teacher(enrollment_id)
);

revoke insert, update, delete on public.item_generation_jobs from anon, authenticated;
grant select on public.item_generation_jobs to authenticated;
