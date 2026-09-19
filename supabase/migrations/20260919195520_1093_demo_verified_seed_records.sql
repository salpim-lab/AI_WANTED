-- 담당: 이지현 (제안) — 2026-09-20 승인 후 공유 DB에 적용 완료(MCP apply_migration, 원격 버전 20260919195520).
-- 공개 데모 방문자 격리 보강: "담임이 썼다"는 것만으로 공용 취급하지 않는다.
--
-- 1092의 work_records 계열 RESTRICTIVE 정책은 "내가 쓴 것 OR 그 반 담임(role='homeroom')이 쓴 것"을 공용으로
-- 봤다. 그런데 담임 작성분 46건 중 8건(record_type='conflict', 랜덤 UUID, 2026-09-19 16:18~16:19에 제목 4개가 2번씩
-- 중복 생성)은 시드 스크립트 산출물로 확인되지 않았다(나머지 38건은 고정 UUID '…-0000-4000-8000-…' = 시드).
-- 확인될 때까지 익명 방문자의 조회에서 제외한다. (이후 확인 결과: 16:19분 4건은 데모용으로 승격, 16:18분 진술 없는
-- 중복 4건은 승인을 받아 삭제 — 봉인 트리거를 그 4건에 한해 한 트랜잭션 안에서만 잠시 껐고 즉시 다시 켰다. 삭제 이력은
-- audit_log에 남았다. 이 마이그레이션 파일에는 삭제 SQL이 없다 — 데이터 작업은 일회성으로 따로 실행함.)
--
-- 규칙: work_records를 방문자에게 보여도 되는 경우 = (내가 쓴 것) OR (그 반 담임이 썼고 AND id가 시드 고정 UUID 형태).
-- 시드로 확인된 id가 늘면 아래 정규식 대신 명시 목록을 쓰도록 이 규칙을 바꾼다(앱 쪽 src/lib/demo/scope.ts의
-- isVerifiedSeedRecordId와 반드시 같이).
--
-- 같은 원칙을 meeting_requests에도 적용: source_session_id가 NULL인 신청은 소유자를 못 가려 공용으로 뒀었는데(1092),
-- 이제 방문자에게는 보이지 않게 한다(현재 그런 행은 0건이라 동작 변화 없음).

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 방문자에게 공용으로 보여도 되는 "검증된 데모 기록"의 단일 판별 함수. 시드 스크립트가 만든 고정 UUID
-- ('…-0000-4000-8000-…') 또는 아래 명시 목록의 id. 팀이 데모용으로 확인한 기록을 공용으로 승격하려면
-- 이 함수의 배열에 id를 추가하는 마이그레이션 한 개면 된다(정책은 이 함수만 본다).
-- 앱 쪽 src/lib/demo/scope.ts의 VERIFIED_EXTRA_RECORD_IDS와 반드시 같은 목록으로 유지한다.
-- (2026-09-20 승인) 목록의 4건 = record_type='conflict' 데모 기록 중 2026-09-19 16:19에 진술까지 완성돼 생성된 것.
-- 같은 제목으로 16:18에 진술 없이 먼저 만들어진 중복 4건은 삭제 대상이라 목록에 넣지 않는다.
create or replace function public.is_verified_demo_record(p_id uuid)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select p_id::text ~ '^[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}$'
      or p_id = any (array[
        'bf7dab9d-4bac-4800-b11d-c2b57cd93623',
        'fe920999-9085-4dac-9537-6da0c140654a',
        'bd702f2f-c525-4734-9105-b734d7568423',
        '4a541946-1407-4d02-bd40-a18db308b4ba'
      ]::uuid[]);
$fn$;

drop policy if exists work_records_demo_owner_restrict on public.work_records;
create policy work_records_demo_owner_restrict on public.work_records
as restrictive
for select to authenticated
using (
  created_by = (select auth.uid())
  or (
    public.is_verified_demo_record(work_records.id)
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
          public.is_verified_demo_record(wr.id)
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
          public.is_verified_demo_record(wr.id)
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
            public.is_verified_demo_record(wr.id)
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

-- ==== (2026-09-20 추가) 익명 사용자 점검으로 찾은 나머지 직접 접근 표면 ====
-- 익명 로그인 사용자도 Postgres 역할은 `authenticated`라서 "그 반 교사/학생이면 읽기" 류 기존 정책이 그대로 적용된다.
-- 실제 DB 전수 조회(pg_policies + 권한)에서 1092가 덮지 않은 테이블을 찾았다.

-- (1) item_generation_jobs(44건)·student_items(42건): AI가 학생 대화에서 만든 추론 결과·학생 메시지가 들어 있고
--     전부 테스트 체크인(현재 개발 계정 소유)에 붙은 것이다. 기존 정책은 enrollment 담당 교사면 전체 읽기라 방문자가
--     REST로 전부 읽을 수 있었다. 다른 부모 연결 테이블과 같은 방식으로 부모 세션 소유자로 좁힌다.
create policy item_generation_jobs_demo_owner_restrict on public.item_generation_jobs
as restrictive
for select to authenticated
using (
  source_session_id is not null
  and exists (
    select 1 from public.checkin_sessions cs
    where cs.id = item_generation_jobs.source_session_id
      and (cs.demo_owner_id is null or cs.demo_owner_id = (select auth.uid()))
  )
);

create policy student_items_demo_owner_restrict on public.student_items
as restrictive
for select to authenticated
using (
  source_session_id is not null
  and exists (
    select 1 from public.checkin_sessions cs
    where cs.id = student_items.source_session_id
      and (cs.demo_owner_id is null or cs.demo_owner_id = (select auth.uid()))
  )
);

-- (2) 방문자가 직접 읽을 이유가 없고 소유자 컬럼도 없는 테이블: 익명 사용자는 접근 자체를 막는다.
--     JWT의 is_anonymous 클레임으로 구분(정식 로그인 사용자는 false, 클레임이 없어도 true가 아니면 통과).
--     consents(보호자 동의 상태), feedback_drafts/sources(교사 코멘트 — 앱은 DB가 아니라 서버 메모리로 쓴다),
--     islands/island_placements(학생 섬 배치). 앱 서버 경로는 service_role이라 영향 없다.
create policy consents_no_anonymous on public.consents
as restrictive for select to authenticated
using (((select auth.jwt()) ->> 'is_anonymous')::boolean is not true);

create policy feedback_drafts_no_anonymous on public.feedback_drafts
as restrictive for select to authenticated
using (((select auth.jwt()) ->> 'is_anonymous')::boolean is not true);

create policy feedback_sources_no_anonymous on public.feedback_sources
as restrictive for select to authenticated
using (((select auth.jwt()) ->> 'is_anonymous')::boolean is not true);

create policy islands_no_anonymous on public.islands
as restrictive for select to authenticated
using (((select auth.jwt()) ->> 'is_anonymous')::boolean is not true);

create policy island_placements_no_anonymous on public.island_placements
as restrictive for select to authenticated
using (((select auth.jwt()) ->> 'is_anonymous')::boolean is not true);

-- (3) 1091이 만든 ai_rate_limits는 Supabase 기본값으로 anon/authenticated에 전체 DML 권한이 붙어 있다.
--     RLS가 켜져 있고 정책이 없어 지금도 거부되지만, 권한 자체도 걷어낸다(서버는 service_role/security definer 함수 경유).
revoke all on table public.ai_rate_limits from anon, authenticated;

-- (4) students.login_code — 방문자(담임 반 assistant)가 REST로 20명 전원의 로그인 코드를 읽을 수 있었다. 앱 코드·뷰·함수·정책은
--     이 컬럼을 쓰지 않는다(스키마와 시드에만 있음). 컬럼 권한은 테이블 권한이 있으면 개별 회수가 안 되므로 테이블 SELECT를 걷고
--     login_code를 뺀 컬럼만 authenticated에 다시 준다. service_role(앱 서버)은 영향 없다. 나중에 컬럼이 늘면 필요한 것만 grant할 것.
revoke select on table public.students from anon, authenticated;
grant select (id, auth_user_id, display_name, status, created_at) on public.students to authenticated;
