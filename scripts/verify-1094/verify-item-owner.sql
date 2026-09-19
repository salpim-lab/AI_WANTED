-- 신규 student_items의 demo_owner_id 누락·불일치 검증 (읽기 전용 SELECT — 공유 DB에서 실행해도 안전하다).
-- 결과가 0행이어야 정상이다. 1행 이상이면 issueStudentItem이 소유자를 빠뜨렸거나(누락) 부모 세션 소유자와 다르게 기록한 것이다.
--
-- "신규"의 기준: earned_at >= legacy_cutoff. 1094 적용 전에 개발 계정이 만든 기존 42건(2026-09-18 10:49 ~ 09-19 18:12 UTC,
-- demo_owner_id가 없는 "레거시")은 제외한다. 적용 후 실제 시각으로 legacy_cutoff를 갱신해 실행해도 된다.
with params as (select timestamptz '2026-09-20 00:00:00+00' as legacy_cutoff)
select
  si.id as student_item_id,
  si.source_session_id,
  si.demo_owner_id as item_owner,
  cs.demo_owner_id as session_owner,
  case
    when si.demo_owner_id is null and cs.demo_owner_id is not null then 'MISSING_OWNER'
    else 'OWNER_MISMATCH'
  end as problem
from public.student_items si
join public.checkin_sessions cs on cs.id = si.source_session_id
cross join params
where not si.is_public_demo
  and si.earned_at >= params.legacy_cutoff
  and si.demo_owner_id is distinct from cs.demo_owner_id
order by si.earned_at;
