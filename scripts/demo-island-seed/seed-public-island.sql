-- 공용 데모 섬 시드 INSERT — 자동 생성 파일(직접 고치지 말 것). 생성: npm run demo-island:seed-sql
-- ⚠️ 1094 적용 뒤에만 실행한다. 별도 승인 전에는 공유 DB에서 실행하지 않는다. 한 트랜잭션이고, 어느 검사든 어긋나면 전체가 롤백된다.
-- 내용: 공용 섬 1개 + 공용 student_items 15개(부모 세션·메시지 없음) + 공용 배치 15개. 기존 42건·job은 건드리지 않는다.
-- 공용 행의 생성은 시드 관리 세션(salpim.seed_admin)에서만 통과한다 — 아래 set_config가 이 트랜잭션에서만 켠다.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select set_config('salpim.seed_admin', 'on', true);

do $$
begin
  if (select count(*) from public.asset_catalog
      where status = 'ready' and style_version = 'procedural-v2' and dedup_key = any (array['item:catalog:moon:procedural-v2', 'item:피자:procedural-v2', 'item:catalog:bedding:procedural-v2', 'item:딸기:procedural-v2', 'item:catalog:locked_box:procedural-v2', 'item:초콜릿케이크:procedural-v2', 'item:catalog:star:procedural-v2', 'item:닭갈비한점:procedural-v2', 'item:catalog:question_sign:procedural-v2', 'item:곰돌이젤리:procedural-v2', 'item:catalog:notebook:procedural-v2', 'item:말랑이:procedural-v2', 'item:귀마개:procedural-v2', 'item:catalog:stone:procedural-v2', 'item:자갈:procedural-v2'])) <> 15 then
    raise exception '시드 실패: 공용 후보 15종의 ready 자산이 모두 있어야 한다';
  end if;
  if exists (select 1 from public.islands where is_public_demo) or exists (select 1 from public.student_items where is_public_demo) then
    raise exception '시드 실패: 공용 섬/아이템이 이미 있다(중복 실행 방지)';
  end if;
end;
$$;

create temp table _demo_island_seed (dedup_key text primary key, slot integer not null, x real not null, z real not null, radius real not null) on commit drop;
insert into _demo_island_seed (dedup_key, slot, x, z, radius) values
  ('item:catalog:moon:procedural-v2', 1, 1.42, 13.566, 0.114),
  ('item:피자:procedural-v2', 2, -1.28, 4.766, 0.063),
  ('item:catalog:bedding:procedural-v2', 3, -5.78, 19.366, 0.114),
  ('item:딸기:procedural-v2', 4, -8.38, 10.766, 0.063),
  ('item:catalog:locked_box:procedural-v2', 5, 1.72, 21.066, 0.114),
  ('item:초콜릿케이크:procedural-v2', 6, 5.52, 7.466, 0.063),
  ('item:catalog:star:procedural-v2', 7, 7.32, 16.166, 0.114),
  ('item:닭갈비한점:procedural-v2', 8, -3.68, 9.166, 0.063),
  ('item:catalog:question_sign:procedural-v2', 9, -5.08, 14.466, 0.114),
  ('item:곰돌이젤리:procedural-v2', 10, -1.48, 17.566, 0.063),
  ('item:catalog:notebook:procedural-v2', 11, 7.22, 11.666, 0.063),
  ('item:말랑이:procedural-v2', 12, 1.22, 8.566, 0.063),
  ('item:귀마개:procedural-v2', 13, 2.82, 17.366, 0.063),
  ('item:catalog:stone:procedural-v2', 14, -2.08, 21.166, 0.063),
  ('item:자갈:procedural-v2', 15, -7.88, 16.566, 0.063);

insert into public.islands (enrollment_id, name, theme, is_public_demo)
values ('40000000-0000-4000-8000-000000000001', '체험 섬', 'meadow', true);

insert into public.student_items (enrollment_id, asset_id, earned_on, slot, is_public_demo)
select '40000000-0000-4000-8000-000000000001', a.id, date '2026-09-01', s.slot, true
from _demo_island_seed s
join public.asset_catalog a on a.dedup_key = s.dedup_key and a.style_version = 'procedural-v2' and a.status = 'ready';

insert into public.island_placements (island_id, student_item_id, position_x, position_y, position_z, footprint_radius)
select i.id, si.id, s.x, 0, s.z, s.radius
from _demo_island_seed s
join public.student_items si on si.is_public_demo and si.slot = s.slot and si.enrollment_id = '40000000-0000-4000-8000-000000000001'
cross join (select id from public.islands where is_public_demo) i;

do $$
begin
  if (select count(*) from public.student_items where is_public_demo) <> 15
     or (select count(*) from public.island_placements p join public.islands i on i.id = p.island_id where i.is_public_demo) <> 15
     or (select count(distinct asset_id) from public.student_items where is_public_demo) <> 15
     or exists (select 1 from public.student_items where is_public_demo and (source_session_id is not null or source_message_id is not null or demo_owner_id is not null)) then
    raise exception '시드 검증 실패: 개수 또는 부모 링크가 예상과 다르다';
  end if;
end;
$$;
commit;
