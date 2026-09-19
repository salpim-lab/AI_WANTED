-- 담당: 이지현 (제안 — 새 테이블/함수라 기존 테이블과 충돌 없음, merge 전 팀 채널 공유)
-- 공개 데모(Vercel) AI 호출 비용 제한. Vercel 서버리스는 인스턴스마다 메모리가 따로라
-- 메모리 카운터로는 막을 수 없다 — DB에 원자적으로 세고 한도를 넘으면 거부한다.
-- 주체(subject)는 보통 익명 세션의 auth.uid() 문자열, 세션이 없으면 IP 등 호출부가 정한 값.

-- 잠금 대기·실행 시간 제한 (한 번의 요청 = 암묵적 트랜잭션, 실패하면 전체 롤백)
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.ai_rate_limits (
  subject text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0 check (count >= 0)
);

comment on table public.ai_rate_limits is
  '공개 데모 AI 호출 횟수 제한용 원자적 카운터. 실 서비스 로그인 붙으면 재검토.';

-- service_role만 쓴다(다른 테이블처럼 일반 쓰기는 revoke돼 있다: 9010_rls.sql 참고).
alter table public.ai_rate_limits enable row level security;

-- (2026-09-20) 정확히 한 번만 원자적으로 "지금 호출 허용되는지" 판단 + 카운트 증가.
-- window_start가 지금부터 p_window_seconds보다 오래됐으면 새 창으로 리셋한다.
create or replace function public.increment_ai_rate_limit(
  p_subject text,
  p_window_seconds integer,
  p_max_calls integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.ai_rate_limits (subject, window_start, count)
  values (p_subject, now(), 1)
  on conflict (subject) do update
    set count = case
          when public.ai_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
            then 1
          else public.ai_rate_limits.count + 1
        end,
        window_start = case
          when public.ai_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
            then now()
          else public.ai_rate_limits.window_start
        end
  returning count into v_count;

  return v_count <= p_max_calls;
end;
$$;

comment on function public.increment_ai_rate_limit is
  '주체별 시간창 안 호출 횟수를 원자적으로 증가시키고, 한도 이내면 true를 돌려준다.';

-- ⚠️ security definer 함수는 기본적으로 PUBLIC(anon·authenticated 포함)이 실행할 수 있다 —
-- 그러면 방문자가 REST/RPC로 이 함수를 직접 불러 p_window_seconds=0으로 자기 카운터를
-- 리셋(호출 제한 우회)하거나 다른 주체의 카운터를 소모시킬 수 있다. 서버(service_role)만 쓴다.
revoke all on function public.increment_ai_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.increment_ai_rate_limit(text, integer, integer) to service_role;
