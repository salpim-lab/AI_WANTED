-- 담당: 이지현 (제안 — 기존 정책을 하나도 안 고치고 RESTRICTIVE 정책만 추가함, PR/리뷰 필요)
-- 공개 데모 방문자 격리 — RLS 구멍 검토 결과와 수정.
--
-- ## 발견한 문제
-- is_class_teacher(), is_enrollment_teacher() 함수는 class_teachers.role을 전혀 안 가린다
-- ('assistant'든 'homeroom'이든 그 반에 등록만 돼 있으면 통과). 그런데 20260920013300_1090
-- 마이그레이션에서 데모 방문자를 class_teachers에 role='assistant'로 등록하기 시작했다
-- (/api/demo/init). 그 결과 다음 기존 PERMISSIVE 정책들이 데모 방문자 전원에게 "같은 반이면
-- 전체 열람 가능"을 그대로 허용해버린다:
--   - checkin_sessions_read, conversation_messages_read → is_enrollment_teacher() 경유
--   - work_records_teacher_read, work_record_students_teacher_read,
--     conflict_statements_teacher_read → is_class_teacher() 경유
-- 즉 지금 상태로 RLS 적용 클라이언트를 쓰거나(현재 앱 코드는 전부 service_role로 우회해서
-- 당장 앱을 통한 유출은 없다), 방문자가 자기 세션으로 Supabase REST API를 직접 호출하면
-- 다른 방문자가 새로 만든 체크인·대화·관찰일지가 그대로 보인다.
--
-- parent_consultations_homeroom_read는 role='homeroom'을 명시적으로 요구해서(is_enrollment_
-- homeroom_teacher) 'assistant' 방문자는 애초에 못 읽는다 — 이 테이블은 안전, 수정 불필요.
--
-- ## 이번 범위에서 뺀 것 (구조상 지금은 못 고침, 후속 작업 필요)
-- - feedback_drafts / feedback_sources: created_by가 'ai'|'teacher' 라벨일 뿐 방문자를
--   구분할 owner 컬럼이 없다. 애초에 앱 코드(comment-draft 라우트)도 아직 demo_owner_id/
--   created_by로 방문자별 필터링을 안 하고 있어서(이번 작업 범위 밖), RLS만 좁혀봐야 의미가
--   없다 — 컬럼 추가 + 앱 코드 변경이 먼저 필요.
-- - analysis_runs: source_type이 session/message/record/student/class 5종류라 소유권 경로가
--   제각각이고, student/class 소스는 애초에 "한 방문자가 새로 만든 것"이라는 개념 자체가
--   불명확하다(반 전체 분석). 앱 코드도 아직 방문자별로 안 나눈다 — 후속 작업.
--
-- ## 수정 방법: RESTRICTIVE 정책 추가
-- Postgres에서 PERMISSIVE 정책끼리는 OR로 결합되지만, RESTRICTIVE 정책은 기존 결과에 AND로
-- 추가 조건을 건다. 그래서 기존 팀원 정책(9010_rls.sql)을 하나도 안 고치고, "그 반 담당자면
-- 열람 가능"이라는 원래 설계(진짜 다인원 교사·보조교사 협업 시나리오에서는 맞는 설계다) 위에
-- "그런데 이게 데모 방문자가 새로 만든 행이면, 내가 만든 것만" 조건을 얹을 수 있다.

create policy checkin_sessions_demo_owner_restrict on public.checkin_sessions
as restrictive
for select to authenticated
using (demo_owner_id is null or demo_owner_id = (select auth.uid()));

create policy conversation_messages_demo_owner_restrict on public.conversation_messages
as restrictive
for select to authenticated
using (
  exists (
    select 1 from public.checkin_sessions cs
    where cs.id = conversation_messages.session_id
      and (cs.demo_owner_id is null or cs.demo_owner_id = (select auth.uid()))
  )
);

-- work_records에는 새 컬럼이 없다(created_by를 그대로 재사용) — "공용"은 NULL이 아니라
-- "그 반의 진짜 담임(role='homeroom')이 쓴 것"이다. UUID를 정책에 직접 박지 않고 그 반의
-- 실제 담임을 매번 다시 찾도록 짰다 — 담임이 바뀌어도 정책을 안 고쳐도 된다.
create policy work_records_demo_owner_restrict on public.work_records
as restrictive
for select to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1 from public.class_teachers ct
    where ct.class_id = work_records.class_id
      and ct.teacher_id = work_records.created_by
      and ct.role = 'homeroom'
  )
);

create policy work_record_students_demo_owner_restrict on public.work_record_students
as restrictive
for select to authenticated
using (
  exists (
    select 1 from public.work_records wr
    where wr.id = work_record_students.work_record_id
      and (
        wr.created_by = (select auth.uid())
        or exists (
          select 1 from public.class_teachers ct
          where ct.class_id = wr.class_id
            and ct.teacher_id = wr.created_by
            and ct.role = 'homeroom'
        )
      )
  )
);

create policy conflict_statements_demo_owner_restrict on public.conflict_statements
as restrictive
for select to authenticated
using (
  exists (
    select 1 from public.work_records wr
    where wr.id = conflict_statements.work_record_id
      and (
        wr.created_by = (select auth.uid())
        or exists (
          select 1 from public.class_teachers ct
          where ct.class_id = wr.class_id
            and ct.teacher_id = wr.created_by
            and ct.role = 'homeroom'
        )
      )
  )
);

-- ⚠️ class_teachers_read는 안 건드렸다 — is_class_teacher()가 통과하면 그 반의 class_teachers
-- 행 전체(다른 데모 방문자의 teacher_id·role 포함)가 보인다. UUID·role만 노출되고 그 자체로
-- 민감하진 않다고 판단해 이번 범위에서는 남겨뒀다 — 필요하면 여기에도 restrictive를 추가한다.
