// 과거 구간 예정 상담 시드 SQL 검증 — 임베디드 Postgres(PGlite)의 스텁 스키마에서 돌린다. 공유 DB 는 건드리지 않는다.
// 실행: npm run test:consult-seed
// 확인: 개수·날짜별 분포(매일 학생 상담 ≥1, 학부모 0~2)·공용 시드 id 패턴·기존 행 보존·다시 실행해도 그대로·검증 실패 시 전체 취소
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const SQL = readFileSync(new URL("./seed-past-scheduled-consultations.sql", import.meta.url), "utf8");
const TEACHER = "1dfa3467-2cba-4e59-a834-6dabb7a77363";
const enr = (n) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// 실제 스키마(1030·1032)에서 이 시드가 만지는 칸과 완료 상담 보호 트리거만 옮긴 스텁
const STUB = `
create table public.enrollments (id uuid primary key);
create table public.class_teachers (teacher_id uuid not null);
create table public.parent_consultations (
  id uuid primary key,
  enrollment_id uuid not null references public.enrollments (id),
  teacher_id uuid not null,
  work_record_id uuid,
  scheduled_at timestamptz not null,
  status text not null check (status in ('preparing','completed')),
  notes text not null default '',
  evidence_refs jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  counterpart text check (counterpart is null or btrim(counterpart) <> ''),
  method text check (method is null or method in ('phone','visit','online')),
  constraint completed_has_record check (status <> 'completed' or work_record_id is not null)
);
create function public.parent_consultation_guard() returns trigger language plpgsql as $$
begin
  if old.status = 'completed' then raise exception '완료한 상담 기록은 수정하거나 삭제할 수 없습니다'; end if;
  return case when TG_OP = 'DELETE' then old else new end;
end; $$;
create trigger parent_consultations_guard before update or delete on public.parent_consultations
  for each row execute function public.parent_consultation_guard();
`;

async function freshDb({ students = 20 } = {}) {
  const db = new PGlite();
  await db.exec(STUB);
  for (let n = 1; n <= students; n++) await db.query("insert into public.enrollments (id) values ($1)", [enr(n)]);
  await db.query("insert into public.class_teachers (teacher_id) values ($1)", [TEACHER]);
  // 이미 있는 시드(예정 1 + 완료 1) — 시드가 이걸 건드리지 않아야 한다
  await db.query(
    `insert into public.parent_consultations (id, enrollment_id, teacher_id, scheduled_at, status, counterpart, method, work_record_id)
     values ('60000000-0000-4000-8000-000000000011', $1, $3, '2026-09-19T15:30:00+09:00', 'preparing', '학생 본인', 'visit', null),
            ('60000000-0000-4000-8000-000000000001', $2, $3, '2026-09-01T16:00:00+09:00', 'completed', '어머니', 'phone', '50000000-0000-4000-8000-000000000033')`,
    [enr(1), enr(4), TEACHER],
  );
  return db;
}

const NEW = "id >= '60000000-0000-4000-8000-000000000101'";

test("34건이 들어가고 기존 행은 그대로다", async () => {
  const db = await freshDb();
  await db.exec(SQL);
  const { rows } = await db.query(`select count(*)::int as n, count(*) filter (where counterpart = '학생 본인')::int as s from public.parent_consultations where ${NEW}`);
  assert.deepEqual(rows[0], { n: 34, s: 23 });
  const old = await db.query("select id, status from public.parent_consultations where id < '60000000-0000-4000-8000-000000000101' order by id");
  assert.deepEqual(old.rows.map((r) => r.status), ["completed", "preparing"]);
});

test("날짜마다 학생 상담이 1건 이상이고, 학부모 상담은 0~2건으로 들쭉날쭉하다 (9/1~9/18)", async () => {
  const db = await freshDb();
  await db.exec(SQL);
  const { rows } = await db.query(`
    select (scheduled_at at time zone 'Asia/Seoul')::date::text as d,
           count(*) filter (where counterpart = '학생 본인')::int as s,
           count(*) filter (where counterpart <> '학생 본인')::int as p
    from public.parent_consultations where ${NEW} group by 1 order by 1`);
  assert.equal(rows.length, 18);
  assert.equal(rows[0].d, "2026-09-01");
  assert.equal(rows.at(-1).d, "2026-09-18");
  for (const r of rows) {
    assert.ok(r.s >= 1 && r.s <= 2, `${r.d} 학생 ${r.s}`);
    assert.ok(r.p >= 0 && r.p <= 2, `${r.d} 학부모 ${r.p}`);
  }
  assert.ok(new Set(rows.map((r) => r.p)).size === 3, "학부모 상담이 0·1·2건으로 다양해야 한다");
  assert.ok(rows.some((r) => r.s === 2) && rows.some((r) => r.s === 1), "학생 상담도 1건·2건이 섞여야 한다");
});

test("시간대(KST 14~17시)·방식·공용 시드 id 패턴·담임 소유가 맞다", async () => {
  const db = await freshDb();
  await db.exec(SQL);
  const { rows } = await db.query(`select id::text, teacher_id::text, status, method, counterpart, extract(hour from scheduled_at at time zone 'Asia/Seoul')::int as h from public.parent_consultations where ${NEW}`);
  for (const r of rows) {
    assert.match(r.id, /^[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}$/i); // lib/demo/scope.ts VERIFIED_SEED_RECORD_ID
    assert.equal(r.teacher_id, TEACHER);
    assert.equal(r.status, "preparing");
    assert.ok(r.h >= 14 && r.h <= 17, `시각 ${r.h}시`);
    assert.ok(["phone", "visit", "online"].includes(r.method));
    if (r.counterpart === "학생 본인") assert.equal(r.method, "visit");
  }
});

test("다시 실행해도 34건 그대로다 (같은 id 는 건너뛴다)", async () => {
  const db = await freshDb();
  await db.exec(SQL);
  await db.exec(SQL);
  const { rows } = await db.query(`select count(*)::int as n from public.parent_consultations where ${NEW}`);
  assert.equal(rows[0].n, 34);
});

test("시드 학생이 모자라면 아무것도 넣지 않고 멈춘다", async () => {
  const db = await freshDb({ students: 10 });
  await assert.rejects(() => db.exec(SQL), /시드 학생 20명/);
  await db.exec("rollback"); // 실제 실행에서는 오류로 스크립트가 멈추고 트랜잭션이 취소된다
  const { rows } = await db.query(`select count(*)::int as n from public.parent_consultations where ${NEW}`);
  assert.equal(rows[0].n, 0);
});
