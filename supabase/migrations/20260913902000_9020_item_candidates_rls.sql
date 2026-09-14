-- 살핌 DB 스키마 v0.3: item_candidates RLS
-- 기존 9010_rls 이후에 추가된 테이블에도 동일한 읽기·쓰기 경계를 적용한다.

alter table public.item_candidates enable row level security;

revoke insert, update, delete on public.item_candidates from anon, authenticated;
grant select on public.item_candidates to authenticated;

create policy item_candidates_read on public.item_candidates
for select to authenticated using (
  public.is_enrollment_student(enrollment_id)
  or public.is_enrollment_teacher(enrollment_id)
);
