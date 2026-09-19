-- 담당: 이지현 (제안) — ⚠️ 작성만 했고 공유 DB에는 아직 적용하지 않았다(적용 승인 대기).
-- 공개 데모 방문자 격리 보강: "담임이 썼다"는 것만으로 공용 취급하지 않는다.
--
-- 1092의 work_records 계열 RESTRICTIVE 정책은 "내가 쓴 것 OR 그 반 담임(role='homeroom')이 쓴 것"을 공용으로
-- 봤다. 그런데 담임 작성분 46건 중 8건(record_type='conflict', 랜덤 UUID, 2026-09-19 16:18~16:19에 제목 4개가 2번씩
-- 중복 생성)은 시드 스크립트 산출물로 확인되지 않았다(나머지 38건은 고정 UUID '…-0000-4000-8000-…' = 시드).
-- 확인될 때까지 익명 방문자의 조회에서 제외한다(삭제하지 않는다 — 봉인된 기록이라 삭제도 안 된다).
--
-- 규칙: work_records를 방문자에게 보여도 되는 경우 = (내가 쓴 것) OR (그 반 담임이 썼고 AND id가 시드 고정 UUID 형태).
-- 시드로 확인된 id가 늘면 아래 정규식 대신 명시 목록을 쓰도록 이 규칙을 바꾼다(앱 쪽 src/lib/demo/scope.ts의
-- isVerifiedSeedRecordId와 반드시 같이).
--
-- 같은 원칙을 meeting_requests에도 적용: source_session_id가 NULL인 신청은 소유자를 못 가려 공용으로 뒀었는데(1092),
-- 이제 방문자에게는 보이지 않게 한다(현재 그런 행은 0건이라 동작 변화 없음).

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop policy if exists work_records_demo_owner_restrict on public.work_records;
create policy work_records_demo_owner_restrict on public.work_records
as restrictive
for select to authenticated
using (
  created_by = (select auth.uid())
  or (
    work_records.id::text ~ '^[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}$'
    and exists (
      select 1 from public.class_teachers ct
      where ct.class_id = work_records.class_id
        and ct.teacher_id = work_records.created_by
        and ct.role = 'homeroom'
    )
  )
);

drop policy if exists work_record_students_demo_owner_restrict on public.work_record_students;
create policy work_record_students_demo_owner_restrict on public.work_record_students
as restrictive
for select to authenticated
using (
  exists (
    select 1 from public.work_records wr
    where wr.id = work_record_students.work_record_id
      and (
        wr.created_by = (select auth.uid())
        or (
          wr.id::text ~ '^[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}$'
          and exists (
            select 1 from public.class_teachers ct
            where ct.class_id = wr.class_id
              and ct.teacher_id = wr.created_by
              and ct.role = 'homeroom'
          )
        )
      )
  )
);

drop policy if exists conflict_statements_demo_owner_restrict on public.conflict_statements;
create policy conflict_statements_demo_owner_restrict on public.conflict_statements
as restrictive
for select to authenticated
using (
  exists (
    select 1 from public.work_records wr
    where wr.id = conflict_statements.work_record_id
      and (
        wr.created_by = (select auth.uid())
        or (
          wr.id::text ~ '^[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}$'
          and exists (
            select 1 from public.class_teachers ct
            where ct.class_id = wr.class_id
              and ct.teacher_id = wr.created_by
              and ct.role = 'homeroom'
          )
        )
      )
  )
);

drop policy if exists analysis_runs_demo_owner_restrict on public.analysis_runs;
create policy analysis_runs_demo_owner_restrict on public.analysis_runs
as restrictive
for select to authenticated
using (
  (
    source_type = 'session'
    and exists (
      select 1 from public.checkin_sessions cs
      where cs.id = analysis_runs.source_id
        and (cs.demo_owner_id is null or cs.demo_owner_id = (select auth.uid()))
    )
  )
  or (
    source_type = 'message'
    and exists (
      select 1
      from public.conversation_messages cm
      join public.checkin_sessions cs on cs.id = cm.session_id
      where cm.id = analysis_runs.source_id
        and (cs.demo_owner_id is null or cs.demo_owner_id = (select auth.uid()))
    )
  )
  or (
    source_type = 'record'
    and exists (
      select 1 from public.work_records wr
      where wr.id = analysis_runs.source_id
        and (
          wr.created_by = (select auth.uid())
          or (
            wr.id::text ~ '^[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}$'
            and exists (
              select 1 from public.class_teachers ct
              where ct.class_id = wr.class_id
                and ct.teacher_id = wr.created_by
                and ct.role = 'homeroom'
            )
          )
        )
    )
  )
  or (
    source_type in ('student', 'class')
    and (analysis_runs.demo_owner_id is null or analysis_runs.demo_owner_id = (select auth.uid()))
  )
);

drop policy if exists meeting_requests_demo_owner_restrict on public.meeting_requests;
create policy meeting_requests_demo_owner_restrict on public.meeting_requests
as restrictive
for select to authenticated
using (
  source_session_id is not null
  and exists (
    select 1 from public.checkin_sessions cs
    where cs.id = meeting_requests.source_session_id
      and (cs.demo_owner_id is null or cs.demo_owner_id = (select auth.uid()))
  )
);
