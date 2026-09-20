-- 1095(session_summary_guard) 롤백 — 1094 적용 직후 상태를 그대로 복원한다. 자동 실행 대상이 아니다(migrations 밖).
-- 문서: docs/데모_방문자_격리_적용_절차.md §17
--
-- 1095는 인덱스 1개와 트리거·함수 2쌍만 추가했다(컬럼·정책·권한·행은 건드리지 않음). 그래서 롤백은 그것들을 지우는 것이 전부이며,
-- 데이터 손실이 없다 — 앱이 저장한 session_summary 행은 그대로 남는다(방문자 데이터가 생긴 뒤에도 실행해도 안전하다).
-- ⚠️ 롤백하면 (1) 같은 세션 요약의 중복 방지, (2) 소유·혼합 저장 방지 가드가 사라진다. 앱 코드는 가드가 있다고 가정하고 쓰므로,
--    롤백 후에는 앱의 DB 저장 경로도 함께 되돌리거나(코드 롤백) 요약 저장을 잠시 끈 상태에서 사용한다.
--
-- 실행 방법(공유 DB 승인 후에만): 한 트랜잭션으로 실행하고, 끝의 검증 쿼리가 모두 true인지 확인한다.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop trigger if exists analysis_runs_session_summary_update_guard on public.analysis_runs;
drop trigger if exists analysis_runs_session_summary_insert_guard on public.analysis_runs;
drop function if exists public.analysis_runs_session_summary_update_guard();
drop function if exists public.analysis_runs_session_summary_insert_guard();
drop index if exists public.analysis_runs_session_summary_uniq;

-- 복원 검증 — 모두 true여야 한다. 하나라도 false면 rollback; 하고 원인을 확인한다.
select
  not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'analysis_runs_session_summary_uniq') as index_gone,
  (select count(*) from pg_trigger where tgrelid = 'public.analysis_runs'::regclass and not tgisinternal) = 0 as no_triggers_left,
  not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname like 'analysis_runs_session_summary_%') as functions_gone,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'analysis_runs') = 2 as policies_untouched;

commit;
