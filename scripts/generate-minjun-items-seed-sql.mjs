// 민준 데모 아이템 18개(src/lib/items/minjunDemoPlacements.json)로 공용 데모 섬의 아이템을 "통째로 교체"하는 SQL을 만든다(기존 공용 15종은 지운다). DB에는 아무것도 하지 않는다.
// 실행: node scripts/generate-minjun-items-seed-sql.mjs → scripts/demo-island-seed/seed-minjun-items.sql (Supabase SQL 편집기에서 사람이 실행)
// 공용 행 생성은 salpim.seed_admin 세션에서만 통과하므로 REST(secret key)로는 못 넣는다.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: false, fsCache: false, alias: { "@": here("../src") } });
const ENROLLMENT = "40000000-0000-4000-8000-000000000001"; // buildSeedSql과 같은 공용 enrollment
const EARNED_ON = "2026-09-01";                              // 공용 시드의 고정 날짜(슬롯 1..18)
const q = (text) => `'${String(text).replaceAll("'", "''")}'`;

const { ITEM_CATALOG, } = await jiti.import("../src/lib/items/itemCatalog.ts");
const { getPlacementRules } = await jiti.import("../src/components/student/island/placementRules.ts");
const placements = JSON.parse(readFileSync(here("../src/lib/items/minjunDemoPlacements.json"), "utf8"));

// 겹침 점검: 시드 INSERT는 서버 검증을 거치지 않으므로 여기서 미리 본다.
const rules = getPlacementRules();
const asset = (spec) => ({ assetFormat: "procedural", geometrySpec: spec });
const rows = placements.map((p, i) => {
  const item = ITEM_CATALOG.find((entry) => entry.id === p.itemId);
  if (!item) throw new Error(`카탈로그에 없는 아이템: ${p.itemId}`);
  return { ...p, slot: i + 1, item, radius: rules.radiusOf(asset(item.spec)) };
});
const clashes = [];
rows.forEach((a, i) => {
  for (const b of rows.slice(0, i)) if (Math.hypot(a.x - b.x, a.z - b.z) < a.radius + b.radius) clashes.push(`${a.itemId} ↔ ${b.itemId}`);
});
if (clashes.length) console.warn(`⚠️ 겹치는 배치 ${clashes.length}건:\n  ${clashes.join("\n  ")}`);

const assetValues = rows.map(({ item }) => {
  const key = `item:catalog:${item.id}:procedural-v2`;
  return `  (${q(key)}, 'procedural-v2', 'item', ${q(item.spec.name)}, ${q(`procedural://${key}`)}, 'preset', 'procedural', ${q(JSON.stringify(item.spec))}::jsonb, 'ready')`;
}).join(",\n");
const seedValues = rows.map(({ item, slot, x, z, radius }) => `  (${q(`item:catalog:${item.id}:procedural-v2`)}, ${slot}, ${x}, ${z}, ${radius})`).join(",\n");

writeFileSync(here("./demo-island-seed/seed-minjun-items.sql"), `-- 민준 데모 아이템 ${rows.length}개로 공용 데모 섬을 교체 — 자동 생성 파일(직접 고치지 말 것). 생성: node scripts/generate-minjun-items-seed-sql.mjs
-- ⚠️ 공용 섬의 기존 공용 아이템·배치(15종)를 지우고 민준 18개로 바꾼다. 방문자 개인 아이템·공용 섬 행·asset_catalog는 건드리지 않는다.
-- 한 트랜잭션이고 어긋나면 전체 롤백. 다시 실행해도 같은 결과(공용 아이템을 지우고 다시 넣는다).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select set_config('salpim.seed_admin', 'on', true);

do $$
begin
  if (select count(*) from public.islands where is_public_demo) <> 1 then
    raise exception '시드 실패: 공용 섬이 1개 있어야 한다(공용 15종 시드 먼저)';
  end if;
end;
$$;

-- 카탈로그 자산: 이미 있으면(공책·책상 등) 그대로 둔다. 모양은 코드의 ITEM_CATALOG가 원본이고 ensurePresetAssetsSynced가 이후에도 맞춘다.
insert into public.asset_catalog (dedup_key, style_version, asset_type, name, model_url, source, asset_format, geometry_spec, status, generation_metadata)
select v.*, '{"kind": "catalog", "geometrySpecVersion": 1}'::jsonb from (values
${assetValues}
) as v(dedup_key, style_version, asset_type, name, model_url, source, asset_format, geometry_spec, status)
on conflict (dedup_key, style_version) do nothing;

delete from public.island_placements p using public.islands i where i.id = p.island_id and i.is_public_demo;
-- student_items_immutable(9000)이 모든 삭제를 막는다. 공용 시드 교체를 위해 이 트랜잭션 안에서만 끄고, 지운 직후 다시 켠다.
alter table public.student_items disable trigger student_items_immutable;
delete from public.student_items where is_public_demo;
alter table public.student_items enable trigger student_items_immutable;

create temp table _minjun_seed (dedup_key text primary key, slot integer not null, x real not null, z real not null, radius real not null) on commit drop;
insert into _minjun_seed (dedup_key, slot, x, z, radius) values
${seedValues};

insert into public.student_items (enrollment_id, asset_id, earned_on, slot, is_public_demo)
select ${q(ENROLLMENT)}, a.id, date ${q(EARNED_ON)}, s.slot, true
from _minjun_seed s
join public.asset_catalog a on a.dedup_key = s.dedup_key and a.style_version = 'procedural-v2' and a.status = 'ready';

insert into public.island_placements (island_id, student_item_id, position_x, position_y, position_z, footprint_radius)
select i.id, si.id, s.x, 0, s.z, s.radius
from _minjun_seed s
join public.student_items si on si.is_public_demo and si.earned_on = date ${q(EARNED_ON)} and si.slot = s.slot and si.enrollment_id = ${q(ENROLLMENT)}
cross join (select id from public.islands where is_public_demo) i;

do $$
begin
  if (select tgenabled from pg_trigger where tgrelid = 'public.student_items'::regclass and tgname = 'student_items_immutable') <> 'O' then
    raise exception '시드 검증 실패: student_items_immutable 트리거가 다시 켜지지 않았다';
  end if;
  if (select count(*) from public.student_items where is_public_demo) <> ${rows.length}
     or (select count(*) from public.island_placements p join public.islands i on i.id = p.island_id where i.is_public_demo) <> ${rows.length} then
    raise exception '시드 검증 실패: 공용 아이템/배치가 ${rows.length}개가 아니다';
  end if;
end;
$$;
commit;
`);
console.log(`seed-minjun-items.sql 생성 (${rows.length}개)`);
