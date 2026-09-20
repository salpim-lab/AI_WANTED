-- 1095 적용 "직전" 확인 — 읽기 전용 SELECT 한 문장. 공유 DB(kdalcsyomdxbdrwmkfqt)에서 적용 승인 직전에 1회 실행하고, 결과의 ok 열이 전부 true인지 본다.
-- ⚠️ 이 파일은 준비만 해 둔 것이다(공유 DB에서 실행하지 않았다). 어떤 행도 만들거나 바꾸지 않는다.
-- 별도로 MCP list_migrations로 원격 최신 버전이 20260920012819(1094)인지 확인한다(이 SQL은 supabase_migrations 스키마를 읽지 않는다).
-- actual 열의 fingerprint(개수 + md5)는 적용 직후 post-apply-checks.sql의 값과 같아야 한다(기존 행 불변 증명) — 이 값을 기록해 둔다.
--
-- 판정 기준: expected와 actual이 같으면 ok=true. 'info' 행은 기록용이라 ok가 항상 true.
with
seed as (
  select * from public.analysis_runs where analysis_type = 'session_summary'
),
dup as (
  select count(*)::int n from (
    select 1 from public.analysis_runs
    where analysis_type = 'session_summary' and source_type = 'session' and status = 'completed'
    group by source_id, prompt_version, coalesce(result ->> 'scope', '')
    having count(*) > 1
  ) t
),
checks(n, name, expected, actual) as (
  select 1, '1095 객체가 아직 없다(인덱스)', '0',
    (select count(*)::text from pg_indexes where schemaname = 'public' and indexname = 'analysis_runs_session_summary_uniq')
  union all select 2, '1095 객체가 아직 없다(트리거)', '0',
    (select count(*)::text from pg_trigger where tgrelid = 'public.analysis_runs'::regclass and not tgisinternal)
  union all select 3, '1095 객체가 아직 없다(함수)', '0',
    (select count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and proname like 'analysis_runs_session_summary_%')
  union all select 4, 'analysis_runs 정책 2개(teacher_read, demo_owner_restrict)', 'analysis_runs_demo_owner_restrict,analysis_runs_teacher_read',
    (select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'analysis_runs')
  union all select 5, '중복 완료 session_summary 그룹(유니크 인덱스 충돌 후보)', '0', (select n::text from dup)
  union all select 6, 'session_summary는 전부 시드(mock, mock-seed-2026-09)뿐이다', '0',
    (select count(*)::text from seed where provider <> 'mock' or prompt_version <> 'mock-seed-2026-09')
  union all select 7, '시드 요약 중 result.sourceSessionIds가 있는 행(기록용 — 있다면 엄격 규칙을 통과하는지 따로 본다)', 'info',
    (select count(*)::text from seed where result ? 'sourceSessionIds')
  union all select 8, '시드 요약이 공용(소유자 NULL) 세션이 아닌 세션에 붙은 행', '0',
    (select count(*)::text from seed s join public.checkin_sessions cs on cs.id = s.source_id where cs.demo_owner_id is not null)
  union all select 9, '시드 요약의 대표 세션이 실제로 없는 행', '0',
    (select count(*)::text from seed s where not exists (select 1 from public.checkin_sessions cs where cs.id = s.source_id))
  union all select 10, '방문자·정식 계정 세션에 연결된 session_summary(앱이 DB에 쓰기 전이라 0이어야 한다)', '0',
    (select count(*)::text from seed s join public.checkin_sessions cs on cs.id = s.source_id where cs.demo_owner_id is not null)
  union all select 11, 'analysis_runs.demo_owner_id 컬럼(1090)·checkin_sessions.demo_owner_id 컬럼 존재', '2',
    (select count(*)::text from information_schema.columns where table_schema = 'public' and column_name = 'demo_owner_id' and table_name in ('analysis_runs', 'checkin_sessions'))
  union all select 12, 'analysis_runs RLS 켜짐', 'true', (select relrowsecurity::text from pg_class where oid = 'public.analysis_runs'::regclass)
  union all select 13, '[기록] 전체 analysis_runs fingerprint (개수|md5) — 적용 후와 같아야 한다', 'info',
    (select count(*)::text || '|' || coalesce(md5(string_agg(id::text || '~' || result::text || '~' || provider || '~' || prompt_version || '~' || status, ',' order by id)), '') from public.analysis_runs)
  union all select 14, '[기록] session_summary 개수', 'info', (select count(*)::text from seed)
)
select n, name, expected, actual, coalesce(expected = 'info' or expected = actual, false) as ok
from checks
order by n;
