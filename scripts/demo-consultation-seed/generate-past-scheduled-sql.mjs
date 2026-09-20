// 담당: 이유민
// 9/1~9/18 의 "예정된 상담" 시드 SQL 을 만든다 (결정적: 같은 입력이면 같은 파일).
//   node scripts/demo-consultation-seed/generate-past-scheduled-sql.mjs > scripts/demo-consultation-seed/seed-past-scheduled-consultations.sql
//
// 왜: 대시보드는 9/1 부터 오늘까지 날짜를 고를 수 있고 "그날 잡힌 예정 상담"만 보여 주는데, 예정 데이터가 9/19 부터라서
// 9/1~9/18 을 보면 학생·학부모 예정 상담이 하나도 안 떴다. 그 구간에 진짜처럼 넣는다.
//
// 진짜처럼: 매일 같은 양이 아니다. 학생 상담은 매일 1~2건, 학부모 상담은 자주 잡지 않으므로 0~2건이고 주말에는 학생 1건만.
// 학생 상담(상담 대상 "학생 본인")은 대시보드 아침 브리핑에만 보이고 학부모 상담기록 화면에는 나오지 않는다.

const TEACHER_ID = "1dfa3467-2cba-4e59-a834-6dabb7a77363"; // 시드 담임 — 이 계정 것이어야 방문자에게 공용으로 보인다
const ID_PREFIX = "60000000-0000-4000-8000-"; // 공용 시드 id 패턴(lib/demo/scope.ts VERIFIED_SEED_RECORD_ID)
const FIRST_SEQ = 101; // 기존 시드는 0001~0051 — 겹치지 않게 0101 부터
const enrollment = (n) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// [날짜, 학생 상담 수, 학부모 상담 수] — 9/1(화) ~ 9/18(금). 9/5·6, 9/12·13 은 주말
const DAYS = [
  ["2026-09-01", 1, 0], ["2026-09-02", 1, 1], ["2026-09-03", 2, 0], ["2026-09-04", 1, 2],
  ["2026-09-05", 1, 0], ["2026-09-06", 1, 0], ["2026-09-07", 2, 1], ["2026-09-08", 1, 0],
  ["2026-09-09", 1, 2], ["2026-09-10", 2, 0], ["2026-09-11", 1, 1], ["2026-09-12", 1, 0],
  ["2026-09-13", 1, 0], ["2026-09-14", 2, 1], ["2026-09-15", 1, 0], ["2026-09-16", 1, 2],
  ["2026-09-17", 1, 1], ["2026-09-18", 2, 0],
];
const TIMES = ["14:00", "14:30", "14:40", "15:00", "15:10", "15:20", "15:30", "16:00", "16:10", "16:30", "17:00"]; // 기존 시드와 같은 시간대(KST)
const PARENT_METHODS = ["phone", "visit", "online", "phone", "visit"];
const PARENT_WHO = ["어머니", "어머니", "아버지", "어머니", "어머니", "아버지"];
const STUDENT_NOTES = ["학기 초 적응 점검", "요즘 학교 생활 이야기 나누기", "체크인 마음 신호등 이야기 듣기", "친구 관계 가볍게 묻기", "이번 주 힘들었던 일 들어 보기"];
const PARENT_NOTES = ["학기 초 학교 생활 공유", "가정에서의 모습 듣기", "요즘 아이 상황 공유", "학부모 궁금한 점 듣기"];

// 학생 1~20 을 결정적으로 돌려 쓰되, 같은 날 같은 학생이 두 번 나오지 않게 한다
const order = [7, 3, 12, 18, 1, 15, 9, 4, 20, 11, 6, 14, 2, 19, 8, 16, 5, 13, 10, 17];
let cursor = 0;
const nextStudent = (used) => {
  for (let i = 0; i < order.length; i++) {
    const n = order[cursor++ % order.length];
    if (!used.has(n)) { used.add(n); return n; }
  }
  throw new Error("학생이 모자란다");
};

const rows = [];
let seq = FIRST_SEQ, t = 0, p = 0;
for (const [date, studentCount, parentCount] of DAYS) {
  const used = new Set();
  for (let i = 0; i < studentCount + parentCount; i++) {
    const isStudent = i < studentCount;
    const n = nextStudent(used);
    const time = TIMES[t++ % TIMES.length];
    rows.push({
      id: ID_PREFIX + String(seq++).padStart(12, "0"),
      enrollment: enrollment(n),
      at: `${date}T${time}:00+09:00`,
      counterpart: isStudent ? "학생 본인" : PARENT_WHO[p % PARENT_WHO.length],
      method: isStudent ? "visit" : PARENT_METHODS[p % PARENT_METHODS.length],
      notes: isStudent ? STUDENT_NOTES[(t + n) % STUDENT_NOTES.length] : PARENT_NOTES[(p + n) % PARENT_NOTES.length],
      student: isStudent,
    });
    if (!isStudent) p++;
  }
}

if (process.argv.includes("--json")) { console.log(JSON.stringify(rows)); process.exit(0); }

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const studentTotal = rows.filter((r) => r.student).length;
const parentTotal = rows.length - studentTotal;
console.log(`-- 과거 구간(9/1~9/18) 예정된 상담 시드 — 자동 생성 파일(직접 고치지 말 것).
-- 생성: node scripts/demo-consultation-seed/generate-past-scheduled-sql.mjs
-- ⚠️ 별도 승인(이지현) 전에는 공유 DB 에서 실행하지 않는다. 한 트랜잭션이고, 이미 있으면(같은 id) 건너뛰고, 검증이 어긋나면 전체가 취소된다.
-- 내용: parent_consultations(status='preparing') ${rows.length}건 = 학생 상담(상담 대상 '학생 본인') ${studentTotal} + 학부모 상담 ${parentTotal}.
--   id 는 공용 시드 패턴(${ID_PREFIX}000000000101~), 담임 계정 소유라서 방문자에게 공용으로 보인다.
--   기존 예정 45건·완료 6건은 건드리지 않는다. INSERT 만 한다(UPDATE·DELETE 없음). 롤백: 아래 id 범위 DELETE (예정 상태라 가드 트리거가 막지 않는다).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if (select count(*) from public.enrollments where id::text like '40000000-0000-4000-8000-0000000000__') < 20 then
    raise exception '시드 실패: 시드 학생 20명(enrollments)이 있어야 한다';
  end if;
  if not exists (select 1 from public.class_teachers where teacher_id = ${q(TEACHER_ID)}) then
    raise exception '시드 실패: 시드 담임 계정이 없다';
  end if;
end;
$$;

insert into public.parent_consultations
  (id, enrollment_id, teacher_id, scheduled_at, status, counterpart, method, notes, created_at, updated_at)
values
${rows
  .map(
    (r) =>
      `  (${q(r.id)}, ${q(r.enrollment)}, ${q(TEACHER_ID)}, ${q(r.at)}, 'preparing', ${q(r.counterpart)}, ${q(r.method)}, ${q(r.notes)}, greatest(${q(r.at)}::timestamptz - interval '3 days', timestamptz '2026-09-01T00:00:00+09:00'), greatest(${q(r.at)}::timestamptz - interval '3 days', timestamptz '2026-09-01T00:00:00+09:00'))`,
  )
  .join(",\n")}
on conflict (id) do nothing;

do $$
declare
  added integer;
begin
  select count(*) into added from public.parent_consultations where id::text >= ${q(rows[0].id)} and id::text <= ${q(rows.at(-1).id)} and status = 'preparing';
  if added <> ${rows.length} then
    raise exception '시드 검증 실패: 새 예정 상담이 ${rows.length}건이어야 하는데 % 건이다', added;
  end if;
  if (select count(*) from public.parent_consultations where status = 'preparing' and counterpart = '학생 본인' and id::text >= ${q(rows[0].id)}) <> ${studentTotal} then
    raise exception '시드 검증 실패: 학생 상담 수가 다르다';
  end if;
end;
$$;

commit;
`);
