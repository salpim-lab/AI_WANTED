// 승인된 공용 15종 좌표(coords.json)로 "공용 시드 INSERT" SQL 파일을 만든다. 이 스크립트도 DB에는 아무것도 하지 않는다.
// 실행: npm run demo-island:seed-sql  →  scripts/demo-island-seed/seed-public-island.sql (1094 적용 뒤, 별도 실행 승인 후에만 공유 DB에서 실행)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const DEMO_ENROLLMENT_ID = "40000000-0000-4000-8000-000000000001"; // src/lib/island/demoIsland.ts와 같은 값
const SEED_EARNED_ON = "2026-09-01";                                 // 공용 시드의 고정 날짜(슬롯 1..15)
const q = (text) => `'${String(text).replaceAll("'", "''")}'`;

export function buildSeedSql() {
  const { placements } = JSON.parse(readFileSync(here("./demo-island-seed/coords.json"), "utf8"));
  const rows = placements.map((p, index) => `  (${q(p.dedupKey)}, ${index + 1}, ${p.x}, ${p.z}, ${p.radius})`).join(",\n");
  const keys = placements.map((p) => q(p.dedupKey)).join(", ");
  return `-- 공용 데모 섬 시드 INSERT — 자동 생성 파일(직접 고치지 말 것). 생성: npm run demo-island:seed-sql
-- ⚠️ 1094 적용 뒤에만 실행한다. 별도 승인 전에는 공유 DB에서 실행하지 않는다. 한 트랜잭션이고, 어느 검사든 어긋나면 전체가 롤백된다.
-- 내용: 공용 섬 1개 + 공용 student_items ${placements.length}개(부모 세션·메시지 없음) + 공용 배치 ${placements.length}개. 기존 42건·job은 건드리지 않는다.
-- 공용 행의 생성은 시드 관리 세션(salpim.seed_admin)에서만 통과한다 — 아래 set_config가 이 트랜잭션에서만 켠다.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select set_config('salpim.seed_admin', 'on', true);

do $$
begin
  if (select count(*) from public.asset_catalog
      where status = 'ready' and style_version = 'procedural-v2' and dedup_key = any (array[${keys}])) <> ${placements.length} then
    raise exception '시드 실패: 공용 후보 ${placements.length}종의 ready 자산이 모두 있어야 한다';
  end if;
  if exists (select 1 from public.islands where is_public_demo) or exists (select 1 from public.student_items where is_public_demo) then
    raise exception '시드 실패: 공용 섬/아이템이 이미 있다(중복 실행 방지)';
  end if;
end;
$$;

create temp table _demo_island_seed (dedup_key text primary key, slot integer not null, x real not null, z real not null, radius real not null) on commit drop;
insert into _demo_island_seed (dedup_key, slot, x, z, radius) values
${rows};

insert into public.islands (enrollment_id, name, theme, is_public_demo)
values (${q(DEMO_ENROLLMENT_ID)}, '체험 섬', 'meadow', true);

insert into public.student_items (enrollment_id, asset_id, earned_on, slot, is_public_demo)
select ${q(DEMO_ENROLLMENT_ID)}, a.id, date ${q(SEED_EARNED_ON)}, s.slot, true
from _demo_island_seed s
join public.asset_catalog a on a.dedup_key = s.dedup_key and a.style_version = 'procedural-v2' and a.status = 'ready';

insert into public.island_placements (island_id, student_item_id, position_x, position_y, position_z, footprint_radius)
select i.id, si.id, s.x, 0, s.z, s.radius
from _demo_island_seed s
join public.student_items si on si.is_public_demo and si.slot = s.slot and si.enrollment_id = ${q(DEMO_ENROLLMENT_ID)}
cross join (select id from public.islands where is_public_demo) i;

do $$
begin
  if (select count(*) from public.student_items where is_public_demo) <> ${placements.length}
     or (select count(*) from public.island_placements p join public.islands i on i.id = p.island_id where i.is_public_demo) <> ${placements.length}
     or (select count(distinct asset_id) from public.student_items where is_public_demo) <> ${placements.length}
     or exists (select 1 from public.student_items where is_public_demo and (source_session_id is not null or source_message_id is not null or demo_owner_id is not null)) then
    raise exception '시드 검증 실패: 개수 또는 부모 링크가 예상과 다르다';
  end if;
end;
$$;
commit;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(here("./demo-island-seed/seed-public-island.sql"), buildSeedSql());
  console.log("seed-public-island.sql 생성");
}
