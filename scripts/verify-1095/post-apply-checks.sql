-- 1095 적용 "직후" 확인 — 읽기 전용 SELECT 한 문장. 적용 직후 1회 실행하고 ok 열이 전부 true인지 본다.
-- 어떤 행도 만들거나 바꾸지 않는다. 2026-09-20 공유 DB에서 1095 적용 직후에 1회 실행했다(13/13 ok, fingerprint 적용 전과 동일, 결과는 §17-10).
-- 행동 검증(가드가 실제로 거부하는지)은 post-apply-behavior-rolled-back.sql — 그것은 롤백 트랜잭션 안에서 잠깐 쓰기를 하므로 별도로 승인받고 실행한다.
--
-- 13번의 fingerprint는 pre-apply-checks.sql 13번과 같은 값이어야 한다(1095가 기존 행을 건드리지 않았다는 증명).
-- 적용 직전에 기록한 값('개수|md5')과 눈으로 비교한다(자동 비교는 없다 — 두 실행은 서로 다른 시점의 별도 쿼리다).
with
seed as (
  select * from public.analysis_runs where analysis_type = 'session_summary'
),
checks(n, name, expected, actual) as (
  select 1, '유니크 인덱스 정의', 'CREATE UNIQUE INDEX analysis_runs_session_summary_uniq ON public.analysis_runs USING btree (source_id, prompt_version, COALESCE((result ->> ''scope''::text), ''''::text)) WHERE ((analysis_type = ''session_summary''::text) AND (source_type = ''session''::text) AND (status = ''completed''::text))',
    (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'analysis_runs_session_summary_uniq')
  union all select 2, '트리거 2개(insert/update 가드)', 'analysis_runs_session_summary_insert_guard,analysis_runs_session_summary_update_guard',
    (select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid = 'public.analysis_runs'::regclass and not tgisinternal)
  union all select 3, '트리거가 활성 상태(O)', 'O,O',
    (select string_agg(tgenabled::text, ',') from pg_trigger where tgrelid = 'public.analysis_runs'::regclass and not tgisinternal)
  union all select 4, '가드 함수 2개, security definer, search_path 고정', '2',
    (select count(*)::text from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'analysis_runs_session_summary_%' and p.prosecdef and p.proconfig::text like '%search_path=%')
  union all select 5, '가드 함수 EXECUTE: anon/authenticated 불가', 'false,false,false,false',
    (select case when to_regprocedure('public.analysis_runs_session_summary_insert_guard()') is null
                   or to_regprocedure('public.analysis_runs_session_summary_update_guard()') is null then 'missing'
                 else has_function_privilege('anon', 'public.analysis_runs_session_summary_insert_guard()', 'execute')::text || ',' ||
                      has_function_privilege('authenticated', 'public.analysis_runs_session_summary_insert_guard()', 'execute')::text || ',' ||
                      has_function_privilege('anon', 'public.analysis_runs_session_summary_update_guard()', 'execute')::text || ',' ||
                      has_function_privilege('authenticated', 'public.analysis_runs_session_summary_update_guard()', 'execute')::text end)
  union all select 6, '정책은 그대로 2개', 'analysis_runs_demo_owner_restrict,analysis_runs_teacher_read',
    (select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'analysis_runs')
  union all select 7, 'authenticated/anon 쓰기 권한 없음(SELECT 등만)', 'false',
    (select (bool_or(privilege_type in ('INSERT', 'UPDATE', 'DELETE')))::text from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'analysis_runs' and grantee in ('anon', 'authenticated'))
  union all select 8, '시드 요약은 여전히 전부 mock/mock-seed-2026-09', '0',
    (select count(*)::text from seed where provider <> 'mock' or prompt_version <> 'mock-seed-2026-09')
  union all select 9, '중복 완료 session_summary 그룹 없음', '0',
    (select count(*)::text from (
       select 1 from public.analysis_runs where analysis_type = 'session_summary' and source_type = 'session' and status = 'completed'
       group by source_id, prompt_version, coalesce(result ->> 'scope', '') having count(*) > 1) t)
  union all select 10, 'analysis_runs RLS 켜짐', 'true', (select relrowsecurity::text from pg_class where oid = 'public.analysis_runs'::regclass)
  union all select 11, '[기록] session_summary 개수(적용 직전과 같아야 한다)', 'info', (select count(*)::text from seed)
  union all select 12, '[기록] 이후 앱이 만든 openai 요약 개수(적용 직후에는 0)', '0', (select count(*)::text from seed where provider = 'openai')
  union all select 13, '[비교] 전체 analysis_runs fingerprint (개수|md5) — 적용 직전 값과 같아야 한다', 'info',
    (select count(*)::text || '|' || coalesce(md5(string_agg(id::text || '~' || result::text || '~' || provider || '~' || prompt_version || '~' || status, ',' order by id)), '') from public.analysis_runs)
)
select n, name, expected, actual, coalesce(expected = 'info' or expected = actual, false) as ok
from checks
order by n;
