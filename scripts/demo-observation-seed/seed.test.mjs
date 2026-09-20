// 9/19~10/5 관찰일지 시드 검증 — 내용 규칙 + 생성 결과 + 임베디드 Postgres(PGlite)에서 SQL 리허설(공유 DB 미사용).
// 실행: node --test scripts/demo-observation-seed/seed.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

import { OBSERVATIONS, SEED_FROM, SEED_TO, STUDENT_NO } from "./observations.mjs";
import { CLASS_ID, FIRST_SEQ, ID_PREFIX, MINJUN_NO, TEACHER_ID, buildRows, buildSql } from "./generate-observation-sql.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const rows = buildRows();

test("범위: 전부 9/19~10/5, 날짜·시각 순으로 정렬, 하루 1~3건", () => {
  assert.ok(rows.length >= 30);
  const perDay = new Map();
  let prev = "";
  for (const r of rows) {
    assert.ok(r.date >= SEED_FROM && r.date <= SEED_TO, `범위 밖: ${r.date}`);
    const key = `${r.date}T${r.time}`;
    assert.ok(key >= prev, `정렬이 어긋남: ${key}`);
    prev = key;
    assert.match(r.time, /^(0[89]|1[0-7]):[0-5]\d$/, `등교~하교 시간대(08~17시)여야 한다: ${r.time}`);
    perDay.set(r.date, (perDay.get(r.date) ?? 0) + 1);
  }
  // 9/19~10/5 = 17일, 하루도 비지 않는다
  assert.equal(perDay.size, 17);
  for (const [date, n] of perDay) assert.ok(n >= 1 && n <= 3, `${date}: 하루 1~3건이어야 한다(${n})`);
});

test("김민준은 태그하지 않고, 태그는 시드 학생 2~20번만, 한 기록에 중복 없음", () => {
  for (const r of rows) {
    assert.ok(r.students.length >= 1 && r.students.length <= 4, `${r.title}: 태그 1~4명`);
    assert.equal(new Set(r.students).size, r.students.length, `${r.title}: 학생 중복`);
    for (const name of r.students) {
      const n = STUDENT_NO[name];
      assert.ok(n >= 2 && n <= 20, `${name}: 시드 학생 2~20번이어야 한다`);
      assert.notEqual(n, MINJUN_NO);
    }
    assert.ok(!r.title.includes("민준") && !r.body.includes("민준"), `${r.title}: 민준 언급 금지`);
  }
  assert.equal(Object.keys(STUDENT_NO).length, 19);
  assert.ok(!("김민준" in STUDENT_NO));
});

test("id: 공용 시드 패턴, 유일, 0101부터 연속", () => {
  const VERIFIED = /^[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}$/i; // lib/demo/scope.ts · 1093 is_verified_demo_record
  const ids = rows.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id, i) => {
    assert.match(id, VERIFIED);
    assert.equal(id, ID_PREFIX + String(FIRST_SEQ + i).padStart(12, "0"));
  });
});

test("가드레일: 진단·점수·위험도·판정 표현이 없고 제목·본문이 비어 있지 않다", () => {
  const FORBIDDEN = ["진단", "장애", "우울", "ADHD", "위험도", "위험 수준", "점수", "문제아", "가해자", "피해자", "잘못했", "나쁜 아이", "무고", "법적"];
  for (const r of rows) {
    assert.ok(r.title.trim() && r.body.trim(), "제목·본문 비어 있음");
    assert.ok(r.body.length >= 60 && r.body.length <= 600, `${r.title}: 본문 길이(${r.body.length})`);
    for (const word of FORBIDDEN) {
      assert.ok(!r.title.includes(word) && !r.body.includes(word), `${r.title}: 금지 표현 "${word}"`);
    }
    assert.ok(!r.body.includes("\n"), "본문은 한 단락(줄바꿈 없음)");
  }
});

test("생성 결과: 커밋된 SQL 파일과 같고, INSERT만 한다", () => {
  const generated = buildSql();
  const committed = readFileSync(join(HERE, "seed-future-observations.sql"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(committed, generated, "seed-future-observations.sql이 생성 결과와 다르다 — 생성 명령을 다시 실행할 것");
  const body = generated.split("\n").filter((l) => !l.startsWith("--")).join("\n");
  assert.ok(!/\b(update|delete|truncate|drop|alter)\b/i.test(body), "UPDATE·DELETE·DDL이 없어야 한다");
  assert.ok(generated.includes("begin;") && generated.includes("commit;"));
});

// ── 임베디드 Postgres 리허설: 앱 스키마의 제약을 그대로 옮긴 최소 스키마 ──
async function freshDb({ enrollments = 20, teacher = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    create table public.profiles (id uuid primary key);
    create table public.classes (id uuid primary key);
    create table public.class_teachers (class_id uuid references public.classes(id), teacher_id uuid references public.profiles(id));
    create table public.enrollments (id uuid primary key);
    create table public.work_records (
      id uuid primary key,
      class_id uuid not null references public.classes(id),
      record_type text not null check (record_type = any (array['general','conflict','consultation','conference','student_consultation'])),
      title text not null check (btrim(title) <> ''),
      body text not null check (btrim(body) <> ''),
      occurred_at timestamptz not null,
      created_by uuid not null references public.profiles(id),
      status text not null check (status = any (array['draft','sealed'])),
      sealed_at timestamptz,
      supersedes_id uuid references public.work_records(id),
      created_at timestamptz not null default now(),
      check ((status = 'draft' and sealed_at is null) or (status = 'sealed' and sealed_at is not null)),
      check (supersedes_id is null or supersedes_id <> id)
    );
    create table public.work_record_students (
      id uuid primary key default gen_random_uuid(),
      work_record_id uuid not null references public.work_records(id),
      enrollment_id uuid not null references public.enrollments(id),
      participant_role text
    );
  `);
  await db.exec(`insert into public.classes(id) values ('${CLASS_ID}')`);
  if (teacher) {
    await db.exec(`insert into public.profiles(id) values ('${TEACHER_ID}')`);
    await db.exec(`insert into public.class_teachers(class_id, teacher_id) values ('${CLASS_ID}', '${TEACHER_ID}')`);
  }
  for (let n = 1; n <= enrollments; n++) {
    await db.exec(`insert into public.enrollments(id) values ('40000000-0000-4000-8000-${String(n).padStart(12, "0")}')`);
  }
  return db;
}

test("리허설: SQL이 실행되고 건수·태그·민준 0건이 맞으며, 다시 실행해도 그대로다(멱등)", async () => {
  const db = await freshDb();
  const linkTotal = rows.reduce((s, r) => s + r.enrollments.length, 0);
  await db.exec(buildSql());
  const count = async (sql) => Number((await db.query(sql)).rows[0].n);
  assert.equal(await count("select count(*) n from public.work_records"), rows.length);
  assert.equal(await count("select count(*) n from public.work_records where record_type='general' and status='sealed' and sealed_at is not null"), rows.length);
  assert.equal(await count("select count(*) n from public.work_record_students"), linkTotal);
  assert.equal(await count(`select count(*) n from public.work_record_students where enrollment_id = '40000000-0000-4000-8000-000000000001'`), 0);
  // 실제 저장된 시각(KST)이 의도한 날짜·시각인지
  const first = (await db.query(`select to_char(occurred_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI') as t from public.work_records order by occurred_at limit 1`)).rows[0].t;
  assert.equal(first, `${rows[0].date} ${rows[0].time}`);
  // 재실행: 같은 id는 건너뛰고 태그도 중복으로 쌓이지 않는다
  await db.exec(buildSql());
  assert.equal(await count("select count(*) n from public.work_records"), rows.length);
  assert.equal(await count("select count(*) n from public.work_record_students"), linkTotal);
  await db.close();
});

test("리허설: 시드 학생이 모자라거나 담임 계정이 없으면 아무것도 넣지 않고 실패한다", async () => {
  // 예외로 중단된 트랜잭션은 요청이 끝나면 통째로 롤백된다(MCP·psql). PGlite 세션에서는 직접 롤백해 그 상태를 재현한다.
  const lacking = await freshDb({ enrollments: 19 });
  await assert.rejects(() => lacking.exec(buildSql()), /시드 학생 20명/);
  await lacking.exec("rollback");
  assert.equal(Number((await lacking.query("select count(*) n from public.work_records")).rows[0].n), 0);
  await lacking.close();

  const noTeacher = await freshDb({ teacher: false });
  await assert.rejects(() => noTeacher.exec(buildSql()), /시드 담임/);
  await noTeacher.exec("rollback");
  assert.equal(Number((await noTeacher.query("select count(*) n from public.work_records")).rows[0].n), 0);
  await noTeacher.close();
});

test("리허설: 검증이 어긋나면(기존 행이 범위 안에 끼어 있으면) 전부 롤백된다", async () => {
  const db = await freshDb();
  // 시드 id 범위 안에 다른 종류의 기록이 미리 있으면 새 건수 검증이 어긋난다 — 트랜잭션 전체가 취소돼야 한다
  await db.exec(`insert into public.work_records (id, class_id, record_type, title, body, occurred_at, created_by, status, sealed_at)
    values ('${rows[3].id}', '${CLASS_ID}', 'consultation', 't', 'b', now(), '${TEACHER_ID}', 'sealed', now())`);
  await assert.rejects(() => db.exec(buildSql()), /시드 검증 실패/);
  await db.exec("rollback");
  assert.equal(Number((await db.query("select count(*) n from public.work_records")).rows[0].n), 1, "기존 1건만 남아야 한다(새 기록은 롤백)");
  assert.equal(Number((await db.query("select count(*) n from public.work_record_students")).rows[0].n), 0);
  await db.close();
});
