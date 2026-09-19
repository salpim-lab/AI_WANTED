-- 담당: 이지현 (제안 — checkin_sessions는 이유민 소유 테이블이라 병합 전 리뷰 필요)
-- 공개 데모(Vercel) 방문자 격리: 로그인 화면 없이 Supabase 익명 인증(signInAnonymously)만
-- 붙이면서, 모든 방문자가 같은 "민준"(같은 enrollment_id)으로 체험해도 각자 새로 만든
-- 체크인만 자기 것으로 보이게 하기 위한 컬럼. 설계 근거는 팀 논의 기록 참고
-- (docs/데모_방문자_격리_쿠키_방식.md 및 관련 논의 — 워크스페이스 커스텀 쿠키 대신
-- Supabase 익명 인증의 auth.uid()를 그대로 소유자 키로 쓰기로 함).
--
-- NULL = 공용 시드 데이터(마이그레이션 시점 기준 기존 행 전부), 값이 있으면 그 값을
-- 만든 익명 방문자(auth.users.id)의 새 데이터. work_records.created_by /
-- parent_consultations.teacher_id처럼 이미 "누가 썼는지" 컬럼이 있는 테이블은 이 컬럼을
-- 새로 안 만들고 그 컬럼을 그대로 재사용한다(별도 논의) — checkin_sessions만 그런 컬럼이
-- 없어서(모든 방문자가 같은 enrollment_id를 공유하므로 기존 유일성만으로 구분 불가) 여기만
-- 새로 추가한다. conversation_messages처럼 session_id로 연결되는 테이블은 새 컬럼 없이 부모
-- 세션의 demo_owner_id를 join으로 따라간다(애플리케이션 코드 책임).
--
-- (2026-09-20 추가) analysis_runs는 처음엔 "session_id로 연결되니 새 컬럼 불필요"로 분류했는데
-- 틀렸다 — source_type이 session/message/record/student/class 5종류이고, 이 중 student(예:
-- 상담 리포트 "기간 요약", source_id=student_id)/class(학급 단위 분석, source_id=class_id) 는
-- 데모 방문자 전원이 같은 student_id·class_id를 공유해서 부모 레코드로는 "누가 만들었는지"를
-- 구분할 방법이 원천적으로 없다. 그래서 analysis_runs에도 checkin_sessions와 같은 전용
-- demo_owner_id 컬럼을 아래에 추가한다 — session/message/record 소스는 계속 부모(checkin_
-- sessions/work_records)의 demo_owner_id를 따라가고, student/class 소스만 이 컬럼을 직접 쓴다
-- (1092 마이그레이션의 analysis_runs_demo_owner_restrict 정책 참고).

alter table public.checkin_sessions
  add column demo_owner_id uuid references auth.users(id);

comment on column public.checkin_sessions.demo_owner_id is
  '공개 데모 격리용. NULL=공용 시드, 값 있으면 그 익명 방문자(auth.uid())가 만든 데이터. 실 서비스 로그인 붙으면 제거 대상.';

-- 기존 unique (enrollment_id, session_date, period, attempt)를 부분 인덱스 두 개로 교체한다.
-- 단순 UNIQUE (demo_owner_id, ...)로는 안 된다 — PostgreSQL은 NULL끼리 서로 다르다고
-- 취급해서, demo_owner_id가 NULL인 기존 공용 행들의 중복을 전혀 막아주지 못한다.
alter table public.checkin_sessions
  drop constraint if exists checkin_sessions_enrollment_id_session_date_period_attempt_key;

create unique index checkin_sessions_public_unique_idx
  on public.checkin_sessions (enrollment_id, session_date, period, attempt)
  where demo_owner_id is null;

create unique index checkin_sessions_demo_owner_unique_idx
  on public.checkin_sessions (demo_owner_id, enrollment_id, session_date, period, attempt)
  where demo_owner_id is not null;

create index checkin_sessions_demo_owner_idx
  on public.checkin_sessions (demo_owner_id)
  where demo_owner_id is not null;

-- analysis_runs 전용 소유자 컬럼 (위 설명 참고) — source_type='student'|'class'일 때만 쓴다.
-- session/message/record 소스는 이 컬럼을 안 채운다(부모 레코드로 구분하므로 항상 NULL로 둔다) —
-- 헷갈리지 않도록 앱 코드에서 그 소스타입들은 이 컬럼에 값을 넣지 않는다.
alter table public.analysis_runs
  add column demo_owner_id uuid references auth.users(id);

comment on column public.analysis_runs.demo_owner_id is
  '공개 데모 격리용. source_type이 student|class일 때만 쓴다(부모 레코드로 소유자를 못 가리는
  소스타입). NULL=공용, 값 있으면 그 익명 방문자(auth.uid())가 만든 분석. session/message/record
  소스는 항상 NULL — 그 소스들은 부모(checkin_sessions/work_records)의 demo_owner_id로 가린다.
  실 서비스 로그인 붙으면 제거 대상.';

create index analysis_runs_demo_owner_idx
  on public.analysis_runs (demo_owner_id)
  where demo_owner_id is not null;

-- ⚠️ RLS는 이 마이그레이션에 포함하지 않았다. 9010_rls.sql의 기존 정책(특히 담당 학급이면
-- 전체 열람 가능한 정책들)이 그대로 남아있으면, 여기 추가한 demo_owner_id 조건을 나중에
-- 정책으로 걸어도 기존의 넓은 permissive 정책과 OR로 결합돼 무력화된다(Postgres는 같은
-- command의 permissive 정책을 OR로 합친다). 기존 정책 전수 검토 후 수정·대체가 필요해서
-- 팀 논의 후 별도 마이그레이션으로 다룬다. 그 전까지 쓰기는 admin 클라이언트 + 서버 코드의
-- 소유권 검사(demo_owner_id = 현재 auth.uid())로 방어한다 — src/lib/checkins/authorize.ts,
-- src/lib/supabase/raw/signalCheckIn.ts 변경 제안 참고.
