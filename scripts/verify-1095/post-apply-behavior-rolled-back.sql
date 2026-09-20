-- 1095 적용 "직후" 행동 검증 — 가드·유니크 인덱스가 실제로 거부/허용하는지 **롤백 트랜잭션 안에서** 확인한다.
-- 실행 시 트랜잭션 안에서 analysis_runs에 행을 잠깐 INSERT하고(마지막에 ROLLBACK) 잔재를 남기지 않는다. 2026-09-20 공유 DB에서 1회 실행했다(14/14 ok, 잔여 행 0, 결과는 §17-10).
--    MCP execute_sql은 마지막 문장의 결과만 돌려주므로 실제 실행에서는 begin/rollback과 끝의 select 대신 `raise exception 'BEHAVIOR_RESULTS_ROLLED_BACK: %', jsonb_agg(_t)`로 종료해
--    결과를 회수하고 요청 전체를 자동 롤백했다(케이스 본문은 이 파일과 동일). 실행 뒤 fingerprint·잔여 행을 별도 SELECT로 확인했다.
--    쓰기가 일어나므로 실행 전에 별도 승인을 받는다. 결과 표(_t)의 ok 열이 전부 true여야 한다. 마지막 rollback이 실행되지 않으면 절대 commit하지 말 것.
-- 샘플 세션은 공유 DB에서 자동으로 고른다(공용 1개, 방문자 1개, 소유 부류가 다른 같은 학생·같은 날 세션 쌍). 쌍이 없으면 그 케이스는 ok=false('샘플 없음')로 표시된다.
--
-- 각 케이스는 하위 트랜잭션(exception 블록)에서 실행해 한 케이스의 오류가 다음 케이스에 영향을 주지 않는다.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create temp table _t (n serial, name text, expected text, actual text, ok boolean) on commit drop;

create function pg_temp.run_case(p_name text, p_expected text, p_sql text) returns void
language plpgsql as $fn$
declare v_actual text;
begin
  begin
    execute p_sql;
    v_actual := 'ok';
  exception
    when check_violation then v_actual := 'check_violation';
    when unique_violation then v_actual := 'unique_violation';
    when others then v_actual := 'other:' || sqlstate;
  end;
  insert into _t (name, expected, actual, ok) values (p_name, p_expected, v_actual, v_actual = p_expected);
end
$fn$;

do $do$
declare
  v_pub uuid;
  v_vis uuid;
  v_vis_owner uuid;
  v_mix_a uuid;
  v_mix_b uuid;
  v_seed uuid;
  v_pv text := 'pre-check-' || to_char(clock_timestamp(), 'HH24MISSMS');
  v_head text := 'insert into public.analysis_runs (analysis_type, source_type, source_id, provider, model, prompt_version, status, result) values (''session_summary'',''session'',';
begin
  select id into v_pub from public.checkin_sessions where demo_owner_id is null order by id limit 1;
  select id, demo_owner_id into v_vis, v_vis_owner from public.checkin_sessions where demo_owner_id is not null order by id limit 1;
  select a.id, b.id into v_mix_a, v_mix_b
    from public.checkin_sessions a
    join public.checkin_sessions b
      on b.enrollment_id = a.enrollment_id and b.session_date = a.session_date and b.id <> a.id
     and coalesce(a.demo_owner_id::text, '~public') <> coalesce(b.demo_owner_id::text, '~public')
   limit 1;
  select id into v_seed from public.analysis_runs where analysis_type = 'session_summary' and provider = 'mock' order by id limit 1;

  if v_pub is null or v_vis is null then
    insert into _t (name, expected, actual, ok) values ('샘플 세션(공용/방문자)을 찾을 수 없다', 'found', 'missing', false);
    return;
  end if;

  -- 1) 정상: 방문자 본인 세션 하나로 만든 등교 요약은 저장된다
  perform pg_temp.run_case('정상 저장(방문자 세션, 엄격 검증 통과)', 'ok',
    v_head || format('%L,''openai'',''pre-check'',%L,''completed'', jsonb_build_object(''summary'',''검증용'',''scope'',''morning'',''sourceSessionIds'', jsonb_build_array(%L)))', v_vis, v_pv, v_vis));
  -- 2) 멱등: 같은 (세션, 버전, scope)를 다시 넣으면 유니크 위반
  perform pg_temp.run_case('같은 요약 재저장은 유니크 위반', 'unique_violation',
    v_head || format('%L,''openai'',''pre-check'',%L,''completed'', jsonb_build_object(''summary'',''중복'',''scope'',''morning'',''sourceSessionIds'', jsonb_build_array(%L)))', v_vis, v_pv, v_vis));
  -- 3) scope가 다르면 별도 행으로 저장 가능(통합 요약 슬롯)
  perform pg_temp.run_case('scope가 다르면 저장(full)', 'ok',
    v_head || format('%L,''openai'',''pre-check'',%L,''completed'', jsonb_build_object(''summary'',''통합'',''scope'',''full'',''sourceSessionIds'', jsonb_build_array(%L)))', v_vis, v_pv, v_vis));
  -- 4) 신규 mock INSERT는 예외가 없다: sourceSessionIds 없는 시드 모양은 공용 세션에도, 방문자 세션에도 거부
  perform pg_temp.run_case('mock 시드 모양 신규 INSERT 거부(공용 세션)', 'check_violation',
    v_head || format('%L,''mock'',null,''mock-seed-2026-09'',''completed'', jsonb_build_object(''summary'',''시드'',''scope'',''morning'')) ', v_pub));
  perform pg_temp.run_case('mock 시드 모양 신규 INSERT 거부(방문자 세션)', 'check_violation',
    v_head || format('%L,''mock'',null,''mock-seed-2026-09'',''completed'', jsonb_build_object(''summary'',''시드'',''scope'',''morning'')) ', v_vis));
  -- 5) sourceSessionIds 누락(openai)
  perform pg_temp.run_case('sourceSessionIds 누락 거부', 'check_violation',
    v_head || format('%L,''openai'',''pre-check'',%L,''completed'', jsonb_build_object(''summary'',''x'',''scope'',''morning''))', v_vis, v_pv || '-noids'));
  -- 6) 존재하지 않는 source_id
  perform pg_temp.run_case('존재하지 않는 source_id 거부', 'check_violation',
    v_head || format('%L,''openai'',''pre-check'',%L,''completed'', jsonb_build_object(''summary'',''x'',''scope'',''morning'',''sourceSessionIds'', jsonb_build_array(%L)))', gen_random_uuid(), v_pv || '-ghost', gen_random_uuid()));
  -- 7) 대표 세션이 sourceSessionIds에 없음
  perform pg_temp.run_case('대표 세션 미포함 거부', 'check_violation',
    v_head || format('%L,''openai'',''pre-check'',%L,''completed'', jsonb_build_object(''summary'',''x'',''scope'',''morning'',''sourceSessionIds'', jsonb_build_array(%L)))', v_vis, v_pv || '-nosrc', v_pub));
  -- 8) 공용+방문자(또는 A+B) 혼합
  if v_mix_a is not null then
    perform pg_temp.run_case('소유 부류가 다른 세션 혼합 거부', 'check_violation',
      v_head || format('%L,''openai'',''pre-check'',%L,''completed'', jsonb_build_object(''summary'',''x'',''scope'',''full'',''sourceSessionIds'', jsonb_build_array(%L,%L)))', v_mix_a, v_pv || '-mix', v_mix_a, v_mix_b));
  else
    insert into _t (name, expected, actual, ok) values ('소유 부류가 다른 세션 혼합 거부', 'check_violation', '샘플 없음(같은 학생·같은 날 세션 쌍이 없다)', false);
  end if;
  -- 9) 소유자 직접 기입
  perform pg_temp.run_case('demo_owner_id 직접 기입 거부', 'check_violation',
    format('insert into public.analysis_runs (analysis_type, source_type, source_id, provider, prompt_version, status, demo_owner_id, result) values (''session_summary'',''session'',%L,''openai'',%L,''completed'',%L, jsonb_build_object(''summary'',''x'',''scope'',''morning'',''sourceSessionIds'', jsonb_build_array(%L)))', v_vis, v_pv || '-owner', v_vis_owner, v_vis));
  -- 10) 잘못된 scope
  perform pg_temp.run_case('잘못된 scope 거부', 'check_violation',
    v_head || format('%L,''openai'',''pre-check'',%L,''completed'', jsonb_build_object(''summary'',''x'',''scope'',''night'',''sourceSessionIds'', jsonb_build_array(%L)))', v_vis, v_pv || '-scope', v_vis));
  -- 11) 빈 요약
  perform pg_temp.run_case('빈 summary 거부', 'check_violation',
    v_head || format('%L,''openai'',''pre-check'',%L,''completed'', jsonb_build_object(''summary'','' '',''scope'',''morning'',''sourceSessionIds'', jsonb_build_array(%L)))', v_vis, v_pv || '-empty', v_vis));
  -- 12) UPDATE 가드: 방금 넣은 행도, 기존 시드 행도 내용 수정 불가
  perform pg_temp.run_case('방금 저장한 요약 수정 거부', 'check_violation',
    format('update public.analysis_runs set result = jsonb_set(result, ''{summary}'', ''"조작"'') where source_id = %L and prompt_version = %L', v_vis, v_pv));
  if v_seed is not null then
    perform pg_temp.run_case('기존 시드 요약 수정 거부', 'check_violation',
      format('update public.analysis_runs set result = jsonb_set(result, ''{summary}'', ''"조작"'') where id = %L', v_seed));
  end if;
end
$do$;

-- 결과 표 — ok가 전부 true여야 한다.
select n, name, expected, actual, ok from _t order by n;

-- 잔재를 남기지 않는다.
rollback;
