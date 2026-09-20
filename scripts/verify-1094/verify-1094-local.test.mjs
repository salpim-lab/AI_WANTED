// 1094 마이그레이션·롤백 로컬 검증 — 임베디드 Postgres(PGlite)에서 "1093 적용 직후" 스텁 스키마에 1094를 적용해 본다.
// 공유 DB에는 아무것도 하지 않는다. 실행: npm run test:1094-local
//
// 이 테스트가 확인하는 것(DB 수준): 소유자 일치 트리거, 부분 유니크 인덱스 3분할, RLS(공용+내 것만, asset_catalog 포함),
// RPC의 소유자 재검증·겹침 재검증·멱등, RPC EXECUTE 권한, 공용 행 보호 트리거, 롤백이 1093 상태를 정확히 복원하는지.
// 스텁의 한계: 실제 Supabase(PostgREST, JWT 서명, 다른 테이블의 FK/정책)는 재현하지 않는다 — 공유 DB 적용 뒤 앱 A/B로 다시 확인한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const BASE = read("./base-schema-1093.sql");
const MIGRATION = read("../../supabase/migrations/20260920130000_1094_demo_shared_island.sql");
const ROLLBACK = read("../../supabase/rollbacks/1094_demo_shared_island_rollback.sql");
const OWNER_CHECK = read("./verify-item-owner.sql");

const E = "40000000-0000-4000-8000-000000000001"; // 시드 enrollment(민준) — 방문자 전원이 공유한다
const U = { A: "aaaaaaaa-0000-4000-8000-000000000001", B: "bbbbbbbb-0000-4000-8000-000000000002", DEV: "dddddddd-0000-4000-8000-000000000003", T: "eeeeeeee-0000-4000-8000-000000000004" };
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = { sA1: uuid(11), sA2: uuid(12), sB1: uuid(13), sDev1: uuid(14), sDev2: uuid(15), sNull1: uuid(16), sNull2: uuid(17) };

async function baseDb() {
  const db = new PGlite();
  await db.exec(BASE);
  await db.query("insert into auth.users (id, email, is_anonymous) values ($1,null,true),($2,null,true),($3,'dev@example.com',false),($4,'t@example.com',false)", [U.A, U.B, U.DEV, U.T]);
  await db.query("insert into public.asset_catalog (id, dedup_key, name) values ($1,'item:pizza','피자'),($2,'item:a-only','A만의 아이템'),($3,'item:b-only','B만의 아이템'),($4,'fallback:gift','선물 상자'),($5,'item:a-real','A의 실제 아이템')",
    [uuid(101), uuid(102), uuid(103), uuid(104), uuid(105)]);
  await db.query(`insert into public.checkin_sessions (id, enrollment_id, demo_owner_id, attempt) values
    ($1,$6,$7,1),($2,$6,$7,2),($3,$6,$8,1),($4,$6,$9,1),($5,$6,$9,2)`, [ID.sA1, ID.sA2, ID.sB1, ID.sDev1, ID.sDev2, E, U.A, U.B, U.DEV]);
  // 소유자 없는 세션(로그인 없는 실서비스/로컬 개발 흐름) — 이 세션의 아이템은 소유자 NULL이 정상이다.
  await db.query("insert into public.checkin_sessions (id, enrollment_id, demo_owner_id, attempt) values ($1,$3,null,1),($2,$3,null,2)", [ID.sNull1, ID.sNull2, E]);
  // 1094 적용 "전"에 개발 계정이 만든 레거시 아이템 2건(실제 DB의 42건에 해당)
  await db.query("insert into public.student_items (id, enrollment_id, asset_id, source_session_id, earned_on, slot, earned_at) values ($1,$3,$4,$5,'2026-09-18',1,'2026-09-19 18:12:31+00'),($2,$3,$4,$6,'2026-09-18',2,'2026-09-19 18:12:31+00')",
    [uuid(201), uuid(202), E, uuid(101), ID.sDev1, ID.sDev2]);
  return db;
}

async function migratedDb() {
  const db = await baseDb();
  await db.exec(MIGRATION);
  return db;
}

/** 특정 역할·JWT로 fn을 실행한다(authenticated/anon은 RLS 적용, service_role은 우회). */
async function as(db, who, fn) {
  await db.exec(`set role ${who.role}`);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(who.sub ? { sub: who.sub, is_anonymous: who.anon === true } : {})]);
  try { return await fn(); } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}
const visitor = (sub) => ({ role: "authenticated", sub, anon: true });
const teacher = { role: "authenticated", sub: U.T, anon: false };
const server = { role: "service_role" };
const ids = (result) => result.rows.map((row) => row.id).sort();

async function seedAdmin(db, fn) {
  await db.transaction(async (tx) => {
    await tx.query("select set_config('salpim.seed_admin', 'on', true)");
    await fn(tx);
  });
}

// ---- 공용 데이터 + 방문자 데이터가 있는 공유 상태(테스트 간 공유) -------------------------------------------------
let db;
const item = { a1: uuid(301), a2: uuid(302), b1: uuid(303), pub1: uuid(311), pub2: uuid(312) };
let publicIslandId;

before(async () => {
  db = await migratedDb();
  // 방문자 아이템(부모 세션 소유자와 일치) — 같은 enrollment·날짜에 A/B가 모두 slot 1을 쓴다.
  await db.query(`insert into public.student_items (id, enrollment_id, asset_id, source_session_id, earned_on, slot, demo_owner_id) values
    ($1,$4,$5,$6,'2026-09-20',1,$9),($2,$4,$7,$8,'2026-09-20',2,$9),($3,$4,$10,$11,'2026-09-20',1,$12)`,
    [item.a1, item.a2, item.b1, E, uuid(102), ID.sA1, uuid(101), ID.sA2, U.A, uuid(103), ID.sB1, U.B]);
  // 공용 시드(부모 없음) + 공용 섬 + 공용 배치 2개 — 시드 관리 세션에서만 가능
  await seedAdmin(db, async (tx) => {
    await tx.query("insert into public.student_items (id, enrollment_id, asset_id, earned_on, slot, is_public_demo) values ($1,$3,$4,'2026-09-01',1,true),($2,$3,$5,'2026-09-01',2,true)", [item.pub1, item.pub2, E, uuid(101), uuid(104)]);
    const { rows } = await tx.query("insert into public.islands (enrollment_id, name, theme, is_public_demo) values ($1,'체험 섬','meadow',true) returning id", [E]);
    publicIslandId = rows[0].id;
    await tx.query("insert into public.island_placements (island_id, student_item_id, position_x, position_z, footprint_radius) values ($1,$2,0,0,0.5),($1,$3,3,3,0.5)", [publicIslandId, item.pub1, item.pub2]);
  });
});

// ============================================================================
test("1094 적용 + 자기 검증 블록 통과, 기존(레거시) 행은 손대지 않았다", async () => {
  const { rows } = await db.query("select count(*)::int n, count(*) filter (where demo_owner_id is null and not is_public_demo)::int legacy from public.student_items where id in ($1,$2)", [uuid(201), uuid(202)]);
  assert.deepEqual(rows[0], { n: 2, legacy: 2 });
  for (const who of [visitor(U.A), visitor(U.B)]) {
    const seen = await as(db, who, () => db.query("select id from public.student_items where id in ($1,$2)", [uuid(201), uuid(202)]));
    assert.equal(seen.rows.length, 0, "방문자에게 레거시 아이템이 보이면 안 된다");
  }
});

test("소유자 트리거: 부모 세션 소유자와 다른/누락된 demo_owner_id, 부모 없는 비공용 아이템은 거부", async () => {
  const insert = (owner, session, slot) => db.query("insert into public.student_items (enrollment_id, asset_id, source_session_id, earned_on, slot, demo_owner_id) values ($1,$2,$3,'2026-09-21',$4,$5)", [E, uuid(101), session, slot, owner]);
  await assert.rejects(insert(U.B, ID.sA1, 1), /ITEM_OWNER_MISMATCH/);          // 타인 uid
  await assert.rejects(insert(null, ID.sA1, 2), /ITEM_OWNER_MISMATCH/);         // 소유자 누락(부모는 방문자 소유)
  await assert.rejects(insert(U.A, null, 3), /ITEM_PARENT_REQUIRED/);           // 부모 없는 비공용
  await insert(U.A, ID.sA1, 4);                                                 // 일치 → 통과
  // 부모 세션과 다른 enrollment
  await assert.rejects(db.query("insert into public.student_items (enrollment_id, asset_id, source_session_id, earned_on, slot, demo_owner_id) values ($1,$2,$3,'2026-09-21',5,$4)", [uuid(999), uuid(101), ID.sA1, U.A]), /ITEM_PARENT_ENROLLMENT_MISMATCH/);
  // 공용 아이템: 시드 관리 세션 밖에서는 못 만들고, 부모 링크가 있으면 CHECK 위반
  await assert.rejects(db.query("insert into public.student_items (enrollment_id, asset_id, earned_on, slot, is_public_demo) values ($1,$2,'2026-09-02',1,true)", [E, uuid(101)]), /PUBLIC_DEMO_SEED_ADMIN_REQUIRED/);
  await assert.rejects(seedAdmin(db, (tx) => tx.query("insert into public.student_items (enrollment_id, asset_id, source_session_id, earned_on, slot, is_public_demo) values ($1,$2,$3,'2026-09-02',1,true)", [E, uuid(101), ID.sA1])), /student_items_visibility_kind_check/);
});

test("생성 job 검증: 접수된 job의 수강 정보(enrollment)가 아이템과 다르면 지급을 거부", async () => {
  await db.query("insert into public.item_generation_jobs (id, enrollment_id, source_session_id) values ($1,$2,$3)", [uuid(401), uuid(999), ID.sB1]);
  // sB1의 job은 enrollment가 다르게 접수돼 있다 → B 소유 아이템 지급도 거부(job.enrollment ≠ item.enrollment)
  await assert.rejects(db.query("insert into public.student_items (enrollment_id, asset_id, source_session_id, earned_on, slot, demo_owner_id) values ($1,$2,$3,'2026-09-22',1,$4)", [E, uuid(103), ID.sB1, U.B]), /ITEM_JOB_OWNER_MISMATCH/);
  await db.query("delete from public.item_generation_jobs where id = $1", [uuid(401)]);
});

test("부분 유니크 인덱스: 방문자끼리 같은 슬롯 OK, 같은 방문자 중복은 거부, 공용·레거시·방문자가 서로 충돌하지 않는다", async () => {
  // before()에서 A slot1 / B slot1 이 같은 enrollment·날짜에 이미 공존한다 = 방문자 인덱스가 owner를 포함한다는 증거
  await assert.rejects(db.query("insert into public.student_items (enrollment_id, asset_id, source_session_id, earned_on, slot, demo_owner_id) values ($1,$2,$3,'2026-09-20',1,$4)", [E, uuid(101), ID.sA2, U.A]), /student_items_daily_slot_owner/);
  // 공용 slot 1(09-01)과 같은 (enrollment,date,slot)의 레거시 행은 충돌하지 않는다: 레거시 인덱스는 owner NULL & 비공용만 본다.
  await db.query("insert into public.student_items (enrollment_id, asset_id, source_session_id, earned_on, slot) values ($1,$2,$3,'2026-09-01',1)", [E, uuid(101), ID.sNull1]);
  // 레거시끼리 같은 슬롯은 여전히 충돌
  await assert.rejects(db.query("insert into public.student_items (enrollment_id, asset_id, source_session_id, earned_on, slot) values ($1,$2,$3,'2026-09-01',1)", [E, uuid(101), ID.sNull2]), /student_items_daily_slot_legacy/);
  // 공용끼리 같은 슬롯도 충돌
  await assert.rejects(seedAdmin(db, (tx) => tx.query("insert into public.student_items (enrollment_id, asset_id, earned_on, slot, is_public_demo) values ($1,$2,'2026-09-01',1,true)", [E, uuid(101)])), /student_items_daily_slot_public/);
  // islands: 방문자마다 개인 섬 1개 + 공용 섬 1개, 레거시 1개가 공존 가능
  await db.query("insert into public.islands (enrollment_id, name, theme) values ($1,'레거시 섬','meadow')", [E]);
  await assert.rejects(db.query("insert into public.islands (enrollment_id, name, theme) values ($1,'레거시 섬2','meadow')", [E]), /islands_enrollment_legacy/);
});

test("RPC: 소유자 재검증(타인 아이템·공용 아이템 거부), 잘못된 인자 거부", async () => {
  const call = (owner, itemId, x = 20, z = 20, r = 0.5) => as(db, server, () => db.query("select public.place_demo_item($1,$2,$3,$4,$5) as id", [owner, itemId, x, z, r]));
  await assert.rejects(call(U.A, item.b1), /ITEM_NOT_OWNED/);                   // A가 B의 아이템
  await assert.rejects(call(U.B, item.a1), /ITEM_NOT_OWNED/);                   // B가 A의 아이템
  await assert.rejects(call(U.A, item.pub1), /PUBLIC_ITEM_IMMUTABLE/);          // 공용 아이템
  await assert.rejects(call(null, item.a1), /OWNER_REQUIRED/);
  await assert.rejects(call(U.A, uuid(999)), /ITEM_NOT_FOUND/);
  await assert.rejects(call(U.A, item.a1, "NaN"), /INVALID_PLACEMENT_ARGUMENT/);
  await assert.rejects(call(U.A, item.a1, 20, 20, 0), /INVALID_PLACEMENT_ARGUMENT/);
  await assert.rejects(call(U.A, item.a1, 5000, 0), /INVALID_PLACEMENT_ARGUMENT/);
});

test("RPC: 소유자 인자를 믿지 않는다 — 아이템 행과 부모 세션·생성 job의 소유자가 어긋난 행은 거부", async () => {
  // 아이템은 A 소유 표시인데 부모 세션은 B 소유인 '오염된' 행을 트리거를 잠시 꺼서 만든다(정상 경로에서는 불가능).
  await db.exec("alter table public.student_items disable trigger student_items_owner_guard");
  await db.query("insert into public.student_items (id, enrollment_id, asset_id, source_session_id, earned_on, slot, demo_owner_id) values ($1,$2,$3,$4,'2026-09-23',1,$5)", [uuid(321), E, uuid(101), ID.sB1, U.A]);
  await db.exec("alter table public.student_items enable trigger student_items_owner_guard");
  await assert.rejects(as(db, server, () => db.query("select public.place_demo_item($1,$2,20,20,0.5)", [U.A, uuid(321)])), /ITEM_PARENT_OWNER_MISMATCH/);
  // 생성 job(student_item_id → item.a1)이 다른 방문자 세션으로 접수된 경우
  await db.query("insert into public.item_generation_jobs (id, enrollment_id, source_session_id, student_item_id) values ($1,$2,$3,$4)", [uuid(402), E, ID.sB1, item.a1]);
  await assert.rejects(as(db, server, () => db.query("select public.place_demo_item($1,$2,20,20,0.5)", [U.A, item.a1])), /ITEM_JOB_OWNER_MISMATCH/);
  await db.query("delete from public.item_generation_jobs where id = $1", [uuid(402)]);
});

test("RPC: 개인 섬 생성 + 배치 저장, 다시 놓으면 이동(중복 배치 없음), 겹침은 공용·내 배치 모두 기준", async () => {
  const place = (owner, itemId, x, z, r = 0.5) => as(db, server, () => db.query("select public.place_demo_item($1,$2,$3,$4,$5) as id", [owner, itemId, x, z, r]));
  const first = (await place(U.A, item.a1, 10, 10)).rows[0].id;
  const again = (await place(U.A, item.a1, 12, 12)).rows[0].id;
  assert.equal(again, first, "같은 아이템은 같은 배치 행을 이동한다");
  const rows = await db.query("select p.position_x, p.position_z, i.demo_owner_id, i.is_public_demo from public.island_placements p join public.islands i on i.id = p.island_id where p.student_item_id = $1", [item.a1]);
  assert.equal(rows.rows.length, 1);
  assert.deepEqual([rows.rows[0].position_x, rows.rows[0].position_z, rows.rows[0].demo_owner_id, rows.rows[0].is_public_demo], [12, 12, U.A, false]);
  assert.equal((await db.query("select count(*)::int n from public.islands where demo_owner_id = $1", [U.A])).rows[0].n, 1, "개인 섬은 방문자당 1개");
  await assert.rejects(place(U.A, item.a2, 0.6, 0), /PLACEMENT_OVERLAP/);       // 공용 배치(0,0,r.5)와 겹침
  await assert.rejects(place(U.A, item.a2, 12.4, 12), /PLACEMENT_OVERLAP/);     // 내 배치와 겹침
  await place(U.A, item.a2, 15, 15);
  // B는 같은 좌표 (12,12)에 놓아도 된다 — 다른 방문자의 배치는 겹침 판정에 들어가지 않는다.
  await place(U.B, item.b1, 12, 12);
  assert.equal((await db.query("select count(*)::int n from public.island_placements")).rows[0].n, 5); // 공용 2 + A 2 + B 1
});

test("RPC: 실제 화면에 쓸 자산은 재시도로 교체된 생성 자산(job.generated_asset_id)을 우선한다", async () => {
  await db.query("insert into public.item_generation_jobs (id, enrollment_id, source_session_id, student_item_id, generated_asset_id) values ($1,$2,$3,$4,$5)", [uuid(403), E, ID.sA2, item.a2, uuid(105)]);
  await as(db, server, () => db.query("select public.place_demo_item($1,$2,16,16,0.5)", [U.A, item.a2]));
  const { rows } = await db.query("select current_asset_id from public.island_placements where student_item_id = $1", [item.a2]);
  assert.equal(rows[0].current_asset_id, uuid(105));
});

test("RPC EXECUTE는 anon/authenticated에 없고 service_role에만 있다", async () => {
  for (const who of [visitor(U.A), teacher, { role: "anon" }]) {
    await assert.rejects(as(db, who, () => db.query("select public.place_demo_item($1,$2,1,1,0.5)", [U.A, item.a1])), /permission denied for function/);
    await assert.rejects(as(db, who, () => db.query("select public.remove_demo_placement($1,$2)", [U.A, item.a1])), /permission denied for function/);
  }
});

test("배치 삭제 RPC: 내 것만, 공용·타인 아이템 거부, 두 번째는 false", async () => {
  const remove = (owner, itemId) => as(db, server, () => db.query("select public.remove_demo_placement($1,$2) as removed", [owner, itemId]));
  await assert.rejects(remove(U.B, item.a2), /ITEM_NOT_OWNED/);
  await assert.rejects(remove(U.A, item.pub1), /PUBLIC_ITEM_IMMUTABLE/);
  assert.equal((await remove(U.A, item.a2)).rows[0].removed, true);
  assert.equal((await remove(U.A, item.a2)).rows[0].removed, false);
  assert.equal((await db.query("select count(*)::int n from public.island_placements where student_item_id = $1", [item.pub1])).rows[0].n, 1, "공용 배치는 그대로");
  await as(db, server, () => db.query("select public.place_demo_item($1,$2,15,15,0.5)", [U.A, item.a2])); // 다시 놓아 이후 테스트 상태 유지
});

test("공용 행 보호 트리거: 시드 관리 세션 밖의 수정·삭제·타 소유 배치는 service_role이어도 거부", async () => {
  await assert.rejects(as(db, server, () => db.query("update public.islands set name = '바꿈' where id = $1", [publicIslandId])), /PUBLIC_ISLAND_READONLY/);
  await assert.rejects(as(db, server, () => db.query("delete from public.islands where id = $1", [publicIslandId])), /PUBLIC_ISLAND_READONLY/);
  await assert.rejects(as(db, server, () => db.query("update public.island_placements set position_x = 99 where student_item_id = $1", [item.pub1])), /PUBLIC_ISLAND_READONLY/);
  await assert.rejects(as(db, server, () => db.query("delete from public.island_placements where student_item_id = $1", [item.pub1])), /PUBLIC_ISLAND_READONLY/);
  await assert.rejects(as(db, server, () => db.query("update public.student_items set slot = 9 where id = $1", [item.pub1])), /기록은 수정하거나 삭제할 수 없습니다/); // 기존 immutable 트리거
  await assert.rejects(as(db, server, () => db.query("insert into public.islands (enrollment_id, name, theme, is_public_demo) values ($1,'가짜 공용','meadow',true)", [uuid(555)])), /PUBLIC_DEMO_SEED_ADMIN_REQUIRED/);
  // 소유 구분 변경 금지
  await assert.rejects(as(db, server, () => db.query("update public.islands set demo_owner_id = $2 where demo_owner_id = $1", [U.A, U.B])), /ISLAND_OWNER_IMMUTABLE/);
  // A의 섬에 B의 아이템, 공용 아이템을 직접 넣기(RPC 우회) → 트리거가 거부
  const aIsland = (await db.query("select id from public.islands where demo_owner_id = $1", [U.A])).rows[0].id;
  await assert.rejects(as(db, server, () => db.query("insert into public.island_placements (island_id, student_item_id, position_x, position_z) values ($1,$2,50,50)", [aIsland, item.b1])), /PLACEMENT_OWNER_MISMATCH|duplicate key/);
  await assert.rejects(as(db, server, () => db.query("insert into public.island_placements (island_id, student_item_id, position_x, position_z) values ($1,$2,50,50)", [aIsland, item.pub2])), /PLACEMENT_OWNER_MISMATCH|duplicate key/);
  // 시드 관리 세션에서는 가능(=유지보수 SQL 경로가 살아 있다)
  await seedAdmin(db, (tx) => tx.query("update public.island_placements set position_x = 0 where student_item_id = $1", [item.pub1]));
});

test("RLS(직접 조회): 방문자는 공용 + 내 것만 — student_items·islands·island_placements", async () => {
  const items = (who) => as(db, who, () => db.query("select id from public.student_items"));
  const islands = (who) => as(db, who, () => db.query("select id, demo_owner_id, is_public_demo from public.islands"));
  const placements = (who) => as(db, who, () => db.query("select student_item_id as id from public.island_placements"));
  const A = visitor(U.A), B = visitor(U.B);
  const aItems = ids(await items(A));
  assert.ok(aItems.includes(item.a1) && aItems.includes(item.a2) && aItems.includes(item.pub1) && aItems.includes(item.pub2));
  assert.ok(!aItems.includes(item.b1) && !aItems.includes(uuid(201)), "다른 방문자·레거시 아이템이 보이면 안 된다");
  const bItems = ids(await items(B));
  assert.ok(bItems.includes(item.b1) && !bItems.includes(item.a1) && !bItems.includes(item.a2));
  const aIslands = (await islands(A)).rows;
  assert.ok(aIslands.every((row) => row.is_public_demo || row.demo_owner_id === U.A), "A는 공용 섬과 자기 섬만 본다");
  assert.equal(aIslands.length, 2);
  const aPlaced = ids(await placements(A));
  assert.deepEqual(aPlaced, [item.a1, item.a2, item.pub1, item.pub2].sort(), "A는 공용 배치 2 + 내 배치 2");
  assert.deepEqual(ids(await placements(B)), [item.b1, item.pub1, item.pub2].sort());
  // 정식 로그인(교사): 공용만(레거시 섬이 있어도 owner NULL 규칙으로 보임) — 방문자의 개인 배치는 보이지 않는다.
  const tPlaced = ids(await placements(teacher));
  assert.ok(!tPlaced.includes(item.a1) && !tPlaced.includes(item.b1));
});

test("RLS asset_catalog(E-3): 익명 방문자는 공용·내 아이템이 참조하는 자산만, 교사(정식 로그인)는 기존처럼 전체", async () => {
  const names = (who, where = "true") => as(db, who, () => db.query(`select name from public.asset_catalog where ${where}`)).then((r) => r.rows.map((x) => x.name).sort());
  const A = visitor(U.A), B = visitor(U.B);
  const a = await names(A);
  assert.ok(a.includes("A만의 아이템") && a.includes("피자") && a.includes("선물 상자") && a.includes("A의 실제 아이템"), `A가 볼 수 있어야 하는 자산: ${a}`);
  assert.ok(!a.includes("B만의 아이템"), "A가 B의 asset name을 직접 조회하면 0건이어야 한다");
  const b = await names(B);
  assert.ok(b.includes("B만의 아이템") && !b.includes("A만의 아이템") && !b.includes("A의 실제 아이템"));
  // id·name으로 직접 지정해도 0건
  assert.equal((await as(db, A, () => db.query("select * from public.asset_catalog where id = $1", [uuid(103)]))).rows.length, 0);
  assert.equal((await as(db, B, () => db.query("select * from public.asset_catalog where name = 'A만의 아이템'"))).rows.length, 0);
  assert.equal((await as(db, A, () => db.query("select geometry_spec from public.asset_catalog where name = 'B만의 아이템'"))).rows.length, 0);
  assert.equal((await names(teacher)).length, 5, "교사(정식 로그인)는 전체 조회 유지");
  // 공유 자산(피자): 참조하는 모든 소유자에게 보인다 — dedup으로 인한 알려진 한계
  assert.ok((await names(B)).includes("피자"));
});

test("방문자의 직접 쓰기(INSERT/UPDATE/DELETE)는 권한 단계에서 막혀 있다", async () => {
  const A = visitor(U.A);
  await assert.rejects(as(db, A, () => db.query("insert into public.island_placements (island_id, student_item_id) values ($1,$2)", [publicIslandId, item.pub1])), /permission denied/);
  await assert.rejects(as(db, A, () => db.query("update public.island_placements set position_x = 1")), /permission denied/);
  await assert.rejects(as(db, A, () => db.query("delete from public.islands")), /permission denied/);
  await assert.rejects(as(db, A, () => db.query("insert into public.student_items (enrollment_id, asset_id, slot) values ($1,$2,1)", [E, uuid(101)])), /permission denied/);
});

test("누락 검증 SQL: 정상 데이터는 0행, 소유자 누락·불일치 행은 잡아낸다(레거시 42건 해당 행은 제외)", async () => {
  // 이 테스트 DB의 행은 earned_on/earned_at이 전부 now()라 cutoff(2026-09-20) 이후 — 레거시 2건(직접 지정한 earned_at 없음)도 포함되므로 cutoff를 미래로 바꿔 레거시만 제외해 본다.
  const cleanSql = OWNER_CHECK.replace("timestamptz '2026-09-20 00:00:00+00'", "timestamptz '1970-01-01 00:00:00+00'");
  const before = await db.query(cleanSql);
  // 레거시(소유자 NULL, 세션 소유자 DEV) 2건 + 위에서 만든 오염 행(321)이 잡힌다 = 검증 SQL이 동작한다는 증거
  const problems = before.rows.map((row) => `${row.student_item_id}:${row.problem}`).sort();
  assert.ok(problems.includes(`${uuid(321)}:OWNER_MISMATCH`), "부모 세션과 다른 소유자 행을 잡아야 한다");
  assert.ok(problems.includes(`${uuid(201)}:MISSING_OWNER`) && problems.includes(`${uuid(202)}:MISSING_OWNER`), "소유자 누락 행을 잡아야 한다");
  // 실제 기준(cutoff = 2026-09-20 00:00Z)에서는 레거시가 earned_at < cutoff여야 제외된다: 레거시 2건의 earned_at을 과거로 둔 별도 DB로 확인
  const fresh = await baseDb();
  await fresh.exec(MIGRATION);
  assert.equal((await fresh.query(OWNER_CHECK)).rows.length, 0, "레거시만 있는 DB는 0행이어야 한다");
  await fresh.query("insert into public.student_items (enrollment_id, asset_id, source_session_id, earned_on, slot, demo_owner_id, earned_at) values ($1,$2,$3,'2026-09-25',1,$4,'2026-09-25 00:00:00+00')", [E, uuid(101), ID.sA1, U.A]);
  assert.equal((await fresh.query(OWNER_CHECK)).rows.length, 0, "정상 신규 아이템은 0행");
  await fresh.exec("alter table public.student_items disable trigger student_items_owner_guard");
  await fresh.query("insert into public.student_items (enrollment_id, asset_id, source_session_id, earned_on, slot, earned_at) values ($1,$2,$3,'2026-09-25',2,'2026-09-25 00:00:00+00')", [E, uuid(101), ID.sA2]);
  const missing = (await fresh.query(OWNER_CHECK)).rows;
  assert.equal(missing.length, 1);
  assert.equal(missing[0].problem, "MISSING_OWNER");
  await fresh.close();
});

// ============================================================================
const snapshot = async (d) => (await d.query(`
  select 'idx' k, tablename || '.' || indexname || ' ' || indexdef v from pg_indexes where schemaname = 'public'
  union all select 'con', conrelid::regclass || '.' || conname || ' ' || pg_get_constraintdef(oid) from pg_constraint where connamespace = 'public'::regnamespace
  union all select 'pol', tablename || '.' || policyname || ' ' || permissive || ' ' || cmd || ' ' || roles::text || ' ' || coalesce(qual, '') || ' | ' || coalesce(with_check, '') from pg_policies where schemaname = 'public'
  union all select 'trg', tgrelid::regclass || '.' || tgname || ' ' || pg_get_triggerdef(oid) from pg_trigger where not tgisinternal
  union all select 'col', table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '') from information_schema.columns where table_schema = 'public'
  union all select 'fn', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' from pg_proc p where p.pronamespace = 'public'::regnamespace
  order by 1, 2`)).rows.map((row) => `${row.k} ${row.v}`);

test("롤백 SQL: 1094를 적용했다가 되돌리면 1093 상태(인덱스·제약·정책·트리거·컬럼·함수)와 정확히 같다", async () => {
  const d = await baseDb();
  const before1093 = await snapshot(d);
  await d.exec(MIGRATION);
  const during = await snapshot(d);
  assert.notDeepEqual(during, before1093, "1094는 실제로 무언가를 바꿔야 한다");
  const result = await d.exec(ROLLBACK);
  const check = result.find((r) => r.rows?.length)?.rows?.[0];
  assert.ok(check && Object.values(check).every((v) => v === true), `롤백 검증 쿼리가 모두 true여야 한다: ${JSON.stringify(check)}`);
  const after = await snapshot(d);
  assert.deepEqual(after.filter((line) => !before1093.includes(line)), [], "롤백 뒤에 1093에 없던 것이 남아 있다");
  assert.deepEqual(before1093.filter((line) => !after.includes(line)), [], "롤백 뒤에 1093에 있던 것이 사라졌다");
  // 1093 동작도 복원: 익명 방문자는 islands를 못 보고 asset_catalog는 전체가 보인다
  assert.equal((await as(d, visitor(U.A), () => d.query("select * from public.islands"))).rows.length, 0);
  await d.close();
});

test("롤백 SQL: 방문자/공용 데이터가 생긴 뒤에는 전체 롤백을 거부한다(§8-2 — 컬럼·행 삭제 금지)", async () => {
  const d = await migratedDb();
  await d.query("insert into public.student_items (enrollment_id, asset_id, source_session_id, earned_on, slot, demo_owner_id) values ($1,$2,$3,'2026-09-20',1,$4)", [E, uuid(101), ID.sA1, U.A]);
  await assert.rejects(d.exec(ROLLBACK), /전체 롤백 불가/);
  await d.exec("rollback");
  // 거부된 뒤에도 1094 상태가 그대로다
  assert.equal((await d.query("select count(*)::int n from pg_indexes where indexname = 'student_items_daily_slot_owner'")).rows[0].n, 1);
  await d.close();
});

// ============================================================================
// 공용 시드 INSERT SQL(승인 전에는 공유 DB에서 실행하지 않는다) — 1094가 적용된 로컬 DB에서만 실행해 본다.
import { buildSeedSql } from "../generate-demo-island-seed-sql.mjs";
const SEED_CANDIDATES = JSON.parse(readFileSync(new URL("../demo-island-seed/candidates.json", import.meta.url), "utf8")).candidates;

test("공용 시드 SQL: 15종 공용 아이템+배치가 생기고, 방문자에게 동일하게 보이며, 부모 링크가 없고, 재실행은 거부된다", async () => {
  const d = await migratedDb();
  for (const [index, candidate] of SEED_CANDIDATES.entries()) {
    await d.query("insert into public.asset_catalog (id, dedup_key, name) values ($1,$2,$3)", [uuid(900 + index), candidate.dedupKey, candidate.name]);
  }
  const sql = buildSeedSql();
  assert.equal(sql, readFileSync(new URL("../demo-island-seed/seed-public-island.sql", import.meta.url), "utf8"), "커밋된 seed-public-island.sql이 생성 결과와 같아야 한다");
  await d.exec(sql);
  const counts = (await d.query("select (select count(*)::int from public.student_items where is_public_demo) items, (select count(*)::int from public.island_placements) placements, (select count(*)::int from public.islands where is_public_demo) islands, (select count(*)::int from public.student_items where is_public_demo and (source_session_id is not null or demo_owner_id is not null)) linked")).rows[0];
  assert.deepEqual(counts, { items: 15, placements: 15, islands: 1, linked: 0 });
  assert.equal((await d.query("select count(*)::int n from public.student_items where id in ($1,$2)", [uuid(201), uuid(202)])).rows[0].n, 2, "기존(레거시) 행은 그대로");
  for (const who of [visitor(U.A), visitor(U.B)]) {
    const placed = await as(d, who, () => d.query("select student_item_id as id, position_x, position_z from public.island_placements order by student_item_id"));
    assert.equal(placed.rows.length, 15, "모든 방문자에게 공용 15개가 보인다");
    assert.equal((await as(d, who, () => d.query("select id from public.asset_catalog"))).rows.length, 15, "공용 아이템이 참조하는 자산 15종이 보인다");
  }
  const a = await as(d, visitor(U.A), () => d.query("select student_item_id, position_x, position_z from public.island_placements order by student_item_id"));
  const b = await as(d, visitor(U.B), () => d.query("select student_item_id, position_x, position_z from public.island_placements order by student_item_id"));
  assert.deepEqual(a.rows, b.rows, "A·B에게 동일");
  await assert.rejects(d.exec(sql), /이미 있다|already|중복/);
  await d.exec("rollback");
  await d.close();
});
