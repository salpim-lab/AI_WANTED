-- 담당: 이지현 (제안 — 기존 정책을 하나도 안 고치고 RESTRICTIVE 정책만 추가함, PR/리뷰 필요)
-- 공개 데모 방문자 격리 — RLS 구멍 검토 결과와 수정.
--
-- ## 발견한 문제
-- is_class_teacher(), is_enrollment_teacher() 함수는 class_teachers.role을 전혀 안 가린다
-- ('assistant'든 'homeroom'이든 그 반에 등록만 돼 있으면 통과). 그런데 20260919184444_1090
-- 마이그레이션에서 데모 방문자를 class_teachers에 role='assistant'로 등록하기 시작했다
-- (/api/demo/init). 그 결과 다음 기존 PERMISSIVE 정책들이 데모 방문자 전원에게 "같은 반이면
-- 전체 열람 가능"을 그대로 허용해버린다:
--   - checkin_sessions_read, conversation_messages_read → is_enrollment_teacher() 경유
--   - work_records_teacher_read, work_record_students_teacher_read,
--     conflict_statements_teacher_read → is_class_teacher() 경유
-- 즉 RLS 적용 클라이언트를 쓰거나, 방문자가 자기 세션으로 Supabase REST API/RPC를 직접
-- 호출하면 다른 방문자가 새로 만든 체크인·대화·관찰일지가 그대로 보인다.
--
-- ⚠️ 정정(2026-09-20): 이전 버전 커밋 메시지에 "지금 앱은 service_role로 우회해서 당장 앱을
-- 통한 유출은 없다"고 적었는데, 이 문구가 오해를 만들 수 있어 다시 쓴다 — service_role은
-- RLS 전체(이 RESTRICTIVE 정책 포함)를 그냥 우회한다. 이 마이그레이션이 막아주는 건 "RLS가
-- 적용되는 경로"(authenticated 세션으로 직접 REST API/RPC를 부르는 경우)뿐이고, 우리 앱
-- 자체(observationLog.ts/consultationLog.ts/signalCheckIn.ts 등)는 지금도 전부 service_role로
-- 쓰기·읽기를 하므로 이 RESTRICTIVE 정책의 보호를 전혀 못 받는다. 앱을 통한 유출을 막는 건
-- 여전히 그 파일들의 서버 쪽 소유권 검사·조회 필터(viewerTeacherId 등, 별도 커밋)의 몫이고,
-- 이 RESTRICTIVE 정책은 그 검사를 "실수로 빠뜨렸을 때"의 마지막 방어선이 아니라 "애초에
-- 앱을 거치지 않고 DB를 직접 두드리는 경로"에 대한 방어선이다 — 서로 겹치지 않는 별개의
-- 방어 계층이니 둘 다 필요하다.
--
-- parent_consultations_homeroom_read는 role='homeroom'을 명시적으로 요구해서(is_enrollment_
-- homeroom_teacher) 'assistant' 방문자는 이 정책 하나는 통과 못 한다 — 다만 "안전하다"고
-- 단정하진 않는다. get_student_context() RPC(is not security definer, 호출자 RLS 그대로 적용)
-- 처럼 다른 경로로 우회되는지까지 확인했고(§RPC·뷰 검토 참고), parent_consultations를 직접
-- 노출하는 다른 함수·뷰는 못 찾았다 — 하지만 이후 새 함수/뷰가 추가되면 다시 확인이 필요하다.
--
-- ## RPC·뷰 검토 (사용자 요청으로 확인)
-- - get_student_context(uuid, timestamptz): security definer 아님(caller 권한으로 실행) +
--   내부에서 쓰는 v_students_current/v_signal_flags 뷰 둘 다 `security_invoker = true`로
--   선언돼 있다 — 즉 호출자의 RLS가 그대로 적용된다. checkin_sessions/work_records를 직접
--   조회하는 부분도 이 마이그레이션의 RESTRICTIVE 정책이 그대로 걸린다. v_signal_flags가 읽는
--   analysis_runs도 아래에서 restrictive를 추가해 이제 같이 막힌다 — meeting_requests도 이 RPC가
--   직접 읽는데 아래에서 restrictive를 추가했다.
-- - authenticated에게 execute 권한이 있는 함수는 is_class_teacher/is_enrollment_*(불리언 확인용,
--   데이터 자체를 안 돌려줌)과 get_student_context뿐이다(전수 확인: `grant execute ... to
--   authenticated`로 grep). 그 외 데이터 노출 경로는 못 찾았다.
--
-- ## 이번 범위에서 뺀 것 (구조상 지금은 못 고침, 후속 작업 필요)
-- - feedback_drafts / feedback_sources: created_by가 'ai'|'teacher' 라벨일 뿐 방문자를
--   구분할 owner 컬럼이 없다. 애초에 앱 코드(comment-draft 라우트)도 아직 demo_owner_id/
--   created_by로 방문자별 필터링을 안 하고 있어서(이번 작업 범위 밖), RLS만 좁혀봐야 의미가
--   없다 — 컬럼 추가 + 앱 코드 변경이 먼저 필요.
-- (2026-09-20 추가) analysis_runs는 더 이상 범위 밖이 아니다 — 아래에서 5개 source_type을
-- 전부 다룬다: session/message/record는 부모 레코드(checkin_sessions/work_records)의 소유권을
-- 따라가고, student/class는 1090에서 추가한 analysis_runs.demo_owner_id를 직접 쓴다. 지금 실제로
-- Supabase에 쓰는 경로는 source_type='session'(감정 어휘 추출 캐시, lib/vocab/liveVocab.ts·
-- api/ai/vocab-growth/route.ts)뿐이고 — 그중 vocab-growth는 RLS가 적용되는 세션 클라이언트를
-- 쓰므로 이 정책이 배포 즉시 유효하다. 하루 분석(dailyAnalysis.ts)·상담 기간요약(periodSummary.ts)은
-- 아직 실제 DB가 아니라 메모리 목업(mockAnalysisRuns, globalThis)에 쓰고 있어 이 정책의 적용
-- 대상이 아니다 — 나중에 실제 analysis_runs로 옮길 때 source_type='session'|'student'인 이
-- 두 경로도 이 정책 아래로 들어온다(session은 바로 적용, student는 쓰기 코드가 demo_owner_id를
-- 채워야 함).
--
-- ## 수정 방법: RESTRICTIVE 정책 추가
-- Postgres에서 PERMISSIVE 정책끼리는 OR로 결합되지만, RESTRICTIVE 정책은 기존 결과에 AND로
-- 추가 조건을 건다. 그래서 기존 팀원 정책(9010_rls.sql)을 하나도 안 고치고, "그 반 담당자면
-- 열람 가능"이라는 원래 설계(진짜 다인원 교사·보조교사 협업 시나리오에서는 맞는 설계다) 위에
-- "그런데 이게 데모 방문자가 새로 만든 행이면, 내가 만든 것만" 조건을 얹을 수 있다.

-- 잠금 대기·실행 시간 제한 (한 번의 요청 = 암묵적 트랜잭션, 실패하면 전체 롤백)
set local lock_timeout = '5s';
set local statement_timeout = '60s';

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

-- (2026-09-20 추가) meeting_requests도 checkin_sessions처럼 체크인에 연결된 "연결 테이블"인데
-- 처음 작성할 때 빠뜨렸다 — meeting_requests_read가 is_enrollment_teacher()(role 무관)를 쓰므로
-- 같은 구멍이 있었다. source_session_id가 NULL인 행(세션과 무관하게 만들어진 경우, 지금 앱
-- 코드에서는 항상 채워지지만 스키마상 nullable)은 방문자를 특정할 방법이 없어 공용으로 둔다.
create policy meeting_requests_demo_owner_restrict on public.meeting_requests
as restrictive
for select to authenticated
using (
  source_session_id is null
  or exists (
    select 1 from public.checkin_sessions cs
    where cs.id = meeting_requests.source_session_id
      and (cs.demo_owner_id is null or cs.demo_owner_id = (select auth.uid()))
  )
);

-- (2026-09-20 추가) analysis_runs — analysis_runs_teacher_read(기존, 9010_rls.sql)와 똑같이
-- source_type별로 나눠서 좁힌다. session/message/record는 부모 레코드의 소유권을 그대로
-- 따라가고(그 부모가 이미 위에서 restrictive로 좁혀진 테이블이다), student/class는 1090에서
-- 추가한 analysis_runs.demo_owner_id를 직접 비교한다 — 부모 레코드로는 "이 반 전체" 또는
-- "이 학생"이라는 정보만 있고 어느 방문자가 만들었는지는 알 수 없기 때문이다.
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
          or exists (
            select 1 from public.class_teachers ct
            where ct.class_id = wr.class_id
              and ct.teacher_id = wr.created_by
              and ct.role = 'homeroom'
          )
        )
    )
  )
  or (
    source_type in ('student', 'class')
    and (analysis_runs.demo_owner_id is null or analysis_runs.demo_owner_id = (select auth.uid()))
  )
);

-- ⚠️ class_teachers_read는 안 건드렸다 — is_class_teacher()가 통과하면 그 반의 class_teachers
-- 행 전체(다른 데모 방문자의 teacher_id·role 포함)가 보인다. UUID·role만 노출되고 그 자체로
-- 민감하진 않다고 판단해 이번 범위에서는 남겨뒀다 — 필요하면 여기에도 restrictive를 추가한다.
