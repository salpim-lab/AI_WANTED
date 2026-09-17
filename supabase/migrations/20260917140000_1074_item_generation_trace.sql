-- 생성 단계별 결과와 실패 원인을 보존한다. AI 출력은 store:false라 다시 재현할 수 없다.
alter table public.item_generation_jobs
  add column inference_output jsonb,
  add column assembly_output jsonb,
  add column last_error_detail jsonb,
  add column student_message text check (char_length(student_message) <= 300);

comment on column public.item_generation_jobs.inference_output is
  '검증을 통과한 추론 결과(핵심 경험·근거 인용·선택 이유 포함). 서비스 역할만 읽는다.';
comment on column public.item_generation_jobs.assembly_output is
  '검증을 통과한 조립 JSON. 카탈로그나 기존 에셋을 재사용하면 NULL이다.';
comment on column public.item_generation_jobs.last_error_detail is
  '마지막 실패의 {stage, raw, error}. 재시도가 성공해도 지우지 않는다. 서비스 역할만 읽는다.';
comment on column public.item_generation_jobs.student_message is
  '학생에게 보여줄 아이템 설명. 생성품이 지급된 completed 상태에서만 채운다.';

-- 상담 인용이 담긴 열을 학생·교사 클라이언트에서 숨긴다. 기존 읽기 열과 학생 설명만 연다.
revoke select on public.item_generation_jobs from anon, authenticated;
grant select (
  id, enrollment_id, source_session_id, candidate_id, status, attempt_count, max_attempts,
  next_attempt_at, last_error_code, last_error_at, fallback_asset_id, generated_asset_id,
  student_item_id, started_at, fallback_at, completed_at, created_at, updated_at, student_message
) on public.item_generation_jobs to authenticated;
