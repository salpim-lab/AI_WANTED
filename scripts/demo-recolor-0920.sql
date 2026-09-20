-- 2026-09-20 공용 시드 체크인의 mood_color를 다양하게 바꾼다 (green 35/38 → 4색 혼합).
-- Supabase SQL Editor에서 한 번만 실행. 대상: demo_owner_id IS NULL 인 9/20 세션만(방문자 데이터는 안 건드림).
-- mood_color 는 checkin_guard 트리거가 막으므로 트랜잭션 안에서만 잠깐 끄고 바로 켠다.
begin;

alter table public.checkin_sessions disable trigger checkin_sessions_guard;

update public.checkin_sessions cs
set mood_color = v.color
from (values
  ('0002','afternoon','yellow'), ('0004','morning','red'),    ('0005','morning','red'),
  ('0005','afternoon','yellow'), ('0006','afternoon','yellow'), ('0007','afternoon','navy'),
  ('0009','morning','yellow'),  ('0010','afternoon','red'),  ('0012','afternoon','yellow'),
  ('0013','morning','yellow'),  ('0015','morning','red'),    ('0016','afternoon','red'),
  ('0018','morning','navy'),    ('0019','afternoon','yellow')
) as v(suffix, period, color)
where cs.session_date = date '2026-09-20'
  and cs.demo_owner_id is null
  and cs.period = v.period
  and right(cs.enrollment_id::text, 4) = v.suffix;

alter table public.checkin_sessions enable trigger checkin_sessions_guard;

-- 14건 바뀌어야 한다.
select mood_color, count(*) from public.checkin_sessions
where session_date = date '2026-09-20' and demo_owner_id is null group by 1 order by 2 desc;

commit;

-- 되돌리기(필요시): 같은 방식으로 트리거를 끄고
--   update ... set mood_color='green' where <위 조건>;  단 원래 yellow 였던 3건은 유지:
--   (0011 morning), (0003 afternoon), (0017 afternoon) = yellow, 나머지는 전부 green.
