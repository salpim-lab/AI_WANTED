-- 1095_session_summary_guard — AI 하루 분석(session_summary)을 DB(analysis_runs)에 안전하게 저장하기 위한 인덱스·가드.
--   문서: docs/데모_방문자_격리_적용_절차.md §17
--
-- 배경: 지금까지 앱은 하루 분석을 서버 메모리(mockAnalysisRuns)에만 저장했다. Vercel(서버리스)에서는 인스턴스가 바뀌면 사라져
--   상세 화면엔 보이는 요약을 챗봇(다른 요청)이 못 읽었다. 이 마이그레이션은 컬럼·정책·권한을 바꾸지 않고,
--   (1) 같은 세션·같은 범위(scope)의 완료 요약이 두 번 저장되지 않게 하는 부분 유니크 인덱스와
--   (2) 잘못된 소유·혼합 저장을 DB에서 막는 가드 트리거만 추가한다.
--
-- 소유자 규약(1090 유지): session 소스 행은 analysis_runs.demo_owner_id를 NULL로 둔다. 소유자는 항상 부모 checkin_sessions.demo_owner_id에서
--   파생하고(읽을 때 RLS analysis_runs_demo_owner_restrict가 그대로 부모를 따라간다), 이 가드가 "쓸 때" 그 부모들이 하나의 소유 부류인지 검증한다.
--
-- 기존 시드 행(2026-09-20 조사, 공유 DB 1,065건: provider='mock', prompt_version='mock-seed-2026-09', 전부 공용 세션, sourceSessionIds 없음)은
--   **이미 저장된 행이라 이 INSERT 가드의 대상이 아니다** — 트리거는 새 INSERT에만 걸리고 기존 행을 검사·수정하지 않는다(유니크 인덱스도 충돌 없음, 아래 0번 확인).
--   따라서 새 INSERT에는 예외가 없다: mock provider든 아니든, 공용 세션이든 방문자 세션이든 **아래 엄격 검증을 전부 통과해야 한다.**
--   (시드 요약의 "읽기" 호환은 앱이 정확한 조건 — provider=mock · prompt_version=mock-seed-2026-09 · 공용 세션 · 완료 — 으로 따로 제한한다: queries/sessionSummaries.ts)
--
-- 엄격 검증(모든 신규 INSERT):
--   ① source_id가 실제 checkin_sessions.id  ② result.sourceSessionIds가 1~20개의 uuid 문자열 배열이고 전부 실제 세션
--   ③ source_id가 그 배열에 포함  ④ 배열의 모든 세션이 같은 demo_owner_id(전부 NULL=공용이거나 전부 같은 방문자) — 공용+방문자, A+B 혼합 금지
--   ⑤ 같은 enrollment·같은 session_date  ⑥ result.scope ∈ {morning, full}  ⑦ 완료 행은 result.summary가 비어 있지 않은 문자열
--   ⑧ analysis_runs.demo_owner_id는 NULL(클라이언트/서버가 소유자를 직접 넣지 못한다)
-- 수정 금지: session_summary 행은 식별·내용 컬럼(source_id, provider, prompt_version, result, status 등) UPDATE 불가(플래그 3개만 허용). DELETE는 막지 않는다(테스트 잔재 정리용).

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 0. 적용 전 확인 — 유니크 인덱스가 충돌할 중복이 이미 있으면 여기서 멈춘다.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from public.analysis_runs
    where analysis_type = 'session_summary' and source_type = 'session' and status = 'completed'
    group by source_id, prompt_version, coalesce(result ->> 'scope', '')
    having count(*) > 1
  ) then
    raise exception '1095 중단: (source_id, prompt_version, scope)가 같은 완료 session_summary가 이미 중복돼 있다. 유니크 인덱스를 만들 수 없다.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. 멱등성 — 같은 세션·같은 prompt_version·같은 범위의 완료 요약은 1건.
--    (scope가 없는 옛 시드 행은 빈 문자열로 묶인다. 프롬프트 버전이 다른 행은 공존할 수 있다 — 재사용 정책은 앱이 정한다.)
-- ---------------------------------------------------------------------------
create unique index analysis_runs_session_summary_uniq
  on public.analysis_runs (source_id, prompt_version, (coalesce(result ->> 'scope', '')))
  where analysis_type = 'session_summary' and source_type = 'session' and status = 'completed';

-- ---------------------------------------------------------------------------
-- 2. INSERT 가드
-- ---------------------------------------------------------------------------
create function public.analysis_runs_session_summary_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src record;
  v_ssi jsonb;
  v_ids uuid[];
  v_found int;
  v_owner_kinds int;
  v_enrollments int;
  v_dates int;
begin
  if new.source_type <> 'session' then
    raise exception 'session_summary는 source_type=session 이어야 한다' using errcode = 'check_violation';
  end if;
  if new.demo_owner_id is not null then
    raise exception 'session_summary는 demo_owner_id를 직접 쓰지 않는다(부모 세션에서 파생)' using errcode = 'check_violation';
  end if;

  select cs.id, cs.demo_owner_id into v_src from public.checkin_sessions cs where cs.id = new.source_id;
  if not found then
    raise exception 'session_summary.source_id가 실제 checkin_sessions가 아니다' using errcode = 'check_violation';
  end if;

  v_ssi := new.result -> 'sourceSessionIds';

  -- ---- 엄격 검증 (신규 INSERT에는 mock/호환 예외가 없다) ----
  if v_ssi is null or jsonb_typeof(v_ssi) <> 'array' or jsonb_array_length(v_ssi) not between 1 and 20 then
    raise exception 'result.sourceSessionIds는 1~20개의 배열이어야 한다' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_ssi) e
    where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'result.sourceSessionIds에 uuid가 아닌 값이 있다' using errcode = 'check_violation';
  end if;

  select array_agg(distinct (e #>> '{}')::uuid) into v_ids from jsonb_array_elements(v_ssi) e;
  if not (new.source_id = any (v_ids)) then
    raise exception 'source_id(대표 세션)가 result.sourceSessionIds에 없다' using errcode = 'check_violation';
  end if;

  select count(*),
         count(distinct coalesce(cs.demo_owner_id::text, '~public')),
         count(distinct cs.enrollment_id),
         count(distinct cs.session_date)
    into v_found, v_owner_kinds, v_enrollments, v_dates
    from public.checkin_sessions cs
    where cs.id = any (v_ids);

  if v_found <> cardinality(v_ids) then
    raise exception 'result.sourceSessionIds에 실제 세션이 아닌 id가 있다' using errcode = 'check_violation';
  end if;
  if v_owner_kinds <> 1 then
    raise exception '요약 입력 세션의 소유자가 섞였다(공용+방문자 또는 서로 다른 방문자)' using errcode = 'check_violation';
  end if;
  if v_enrollments <> 1 or v_dates <> 1 then
    raise exception '요약 입력 세션은 같은 학생·같은 날짜여야 한다' using errcode = 'check_violation';
  end if;

  if coalesce(new.result ->> 'scope', '') not in ('morning', 'full') then
    raise exception 'result.scope는 morning 또는 full이어야 한다' using errcode = 'check_violation';
  end if;
  if new.status = 'completed'
     and (jsonb_typeof(new.result -> 'summary') is distinct from 'string' or btrim(new.result ->> 'summary') = '') then
    raise exception '완료된 session_summary에는 result.summary(비어 있지 않은 문자열)가 필요하다' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. UPDATE 가드 — 식별·내용 컬럼 변경 금지(원본 불변, 해석은 새 행). 플래그 3개만 예외.
-- ---------------------------------------------------------------------------
create function public.analysis_runs_session_summary_update_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['moderation_flag', 'needs_followup', 'category_tags'])
     is distinct from (to_jsonb(old) - array['moderation_flag', 'needs_followup', 'category_tags']) then
    raise exception 'session_summary 행은 수정할 수 없다(새 행을 추가한다)' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.analysis_runs_session_summary_insert_guard() from public, anon, authenticated;
revoke all on function public.analysis_runs_session_summary_update_guard() from public, anon, authenticated;

create trigger analysis_runs_session_summary_insert_guard
  before insert on public.analysis_runs
  for each row
  when (new.analysis_type = 'session_summary')
  execute function public.analysis_runs_session_summary_insert_guard();

create trigger analysis_runs_session_summary_update_guard
  before update on public.analysis_runs
  for each row
  when (old.analysis_type = 'session_summary' or new.analysis_type = 'session_summary')
  execute function public.analysis_runs_session_summary_update_guard();

-- ---------------------------------------------------------------------------
-- 4. 자기 검증 — 하나라도 어긋나면 예외로 전체 롤백된다.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'analysis_runs_session_summary_uniq') then
    raise exception '1095 자기 검증 실패: 유니크 인덱스가 없다';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.analysis_runs'::regclass and not tgisinternal
        and tgname in ('analysis_runs_session_summary_insert_guard', 'analysis_runs_session_summary_update_guard')) <> 2 then
    raise exception '1095 자기 검증 실패: 가드 트리거 2개가 아니다';
  end if;
  if has_function_privilege('anon', 'public.analysis_runs_session_summary_insert_guard()', 'execute')
     or has_function_privilege('authenticated', 'public.analysis_runs_session_summary_insert_guard()', 'execute')
     or has_function_privilege('anon', 'public.analysis_runs_session_summary_update_guard()', 'execute')
     or has_function_privilege('authenticated', 'public.analysis_runs_session_summary_update_guard()', 'execute') then
    raise exception '1095 자기 검증 실패: 가드 함수를 anon/authenticated가 실행할 수 있다';
  end if;
end;
$$;
