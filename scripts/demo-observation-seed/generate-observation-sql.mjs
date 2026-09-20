// 담당: 김현우
// 9/19~10/5 "학생관찰일지" 시드 SQL을 만든다 (결정적: 같은 입력이면 같은 파일).
//   node scripts/demo-observation-seed/generate-observation-sql.mjs > scripts/demo-observation-seed/seed-future-observations.sql
//
// 왜: 공용 시드(체크인·AI 요약·상담 일정)는 10/5까지 있는데 관찰일지는 9/18에서 끊겨, 9/19 이후 날짜를 보면 관찰일지가 비어 있다.
// 앱은 "오늘(KST)보다 미래인 관찰일지"를 목록에서 항상 걸러 내므로(observationLog.ts) 미리 넣어 둬도 그날이 되기 전에는 안 보인다.
//
// 형식은 앱이 저장하는 것과 같다: work_records(record_type='general', status='sealed') + work_record_students(participant_role='participant').
// id는 공용 시드 패턴(xxxxxxxx-0000-4000-8000-…, lib/demo/scope.ts VERIFIED_SEED_RECORD_ID · 1093 is_verified_demo_record)이고
// 담임 계정 소유라서 방문자에게 공용으로 보인다.

import { OBSERVATIONS, STUDENT_NO } from "./observations.mjs";

export const TEACHER_ID = "1dfa3467-2cba-4e59-a834-6dabb7a77363"; // 시드 담임
export const CLASS_ID = "20000000-0000-4000-8000-000000000001";
export const ID_PREFIX = "50000000-0000-4000-8000-"; // 기존 관찰일지 시드 id 패턴
export const FIRST_SEQ = 101; // 기존 시드는 0001~0051 — 겹치지 않게 0101 부터
export const MINJUN_NO = 1;

const enrollment = (n) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function buildRows() {
  return OBSERVATIONS.map(([date, time, title, students, body], i) => ({
    id: ID_PREFIX + String(FIRST_SEQ + i).padStart(12, "0"),
    date,
    time,
    at: `${date}T${time}:00+09:00`,
    title,
    body,
    students,
    enrollments: students.map((name) => {
      const n = STUDENT_NO[name];
      if (!n) throw new Error(`알 수 없는 학생: ${name}`);
      return enrollment(n);
    }),
  }));
}

export function buildSql() {
  const rows = buildRows();
  const linkTotal = rows.reduce((sum, r) => sum + r.enrollments.length, 0);
  const firstId = rows[0].id;
  const lastId = rows.at(-1).id;
  const days = new Set(rows.map((r) => r.date)).size;

  return `-- 9/19~10/5 학생관찰일지 시드 — 자동 생성 파일(직접 고치지 말 것).
-- 생성: node scripts/demo-observation-seed/generate-observation-sql.mjs
-- ⚠️ 승인 전에는 공유 DB에서 실행하지 않는다. 한 트랜잭션이고, 이미 있으면(같은 id) 건너뛰고, 검증이 어긋나면 전부 롤백된다.
-- ⚠️ 되돌릴 수 없다: work_records는 봉인(sealed)되어 UPDATE·DELETE가 트리거(work_records_guard)로 막힌다.
--    잘못 넣으면 지우려면 봉인 트리거를 잠시 끄는 별도 승인 절차가 필요하다(1093에서 4건 삭제할 때와 같은 방식). 실행 전에 내용을 꼭 검토한다.
-- 내용: 학생관찰일지(general) ${rows.length}건(${days}일, ${rows[0].date}~${rows.at(-1).date}) + 학생 태그 ${linkTotal}건. 김민준(1번)은 태그하지 않는다.
--   id 는 ${ID_PREFIX}${String(FIRST_SEQ).padStart(12, "0")}~${String(FIRST_SEQ + rows.length - 1).padStart(12, "0")} (공용 시드 패턴), 담임 계정 소유라서 방문자에게 공용으로 보인다.
--   미래 날짜는 앱이 목록에서 걸러 내므로(observationLog.ts) 그날이 되기 전에는 화면에 나오지 않는다.
--   INSERT 만 한다(UPDATE·DELETE 없음). 기존 관찰일지·다른 표는 건드리지 않는다.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if (select count(*) from public.enrollments where id::text like '40000000-0000-4000-8000-0000000000__') < 20 then
    raise exception '시드 실패: 시드 학생 20명(enrollments)이 있어야 한다';
  end if;
  if not exists (select 1 from public.class_teachers where teacher_id = ${q(TEACHER_ID)} and class_id = ${q(CLASS_ID)}) then
    raise exception '시드 실패: 시드 담임 계정이 시드 학급에 없다';
  end if;
  if not exists (select 1 from public.profiles where id = ${q(TEACHER_ID)}) then
    raise exception '시드 실패: 시드 담임 프로필이 없다';
  end if;
end;
$$;

-- 감사 로그(audit_log)의 행위자가 비지 않게 한다
select set_config('app.actor_id', ${q(TEACHER_ID)}, true);

insert into public.work_records
  (id, class_id, record_type, title, body, occurred_at, created_by, status, sealed_at, created_at)
values
${rows
  .map(
    (r) =>
      `  (${q(r.id)}, ${q(CLASS_ID)}, 'general', ${q(r.title)}, ${q(r.body)}, ${q(r.at)}, ${q(TEACHER_ID)}, 'sealed', ${q(r.at)}::timestamptz + interval '20 minutes', ${q(r.at)}::timestamptz + interval '20 minutes')`,
  )
  .join(",\n")}
on conflict (id) do nothing;

insert into public.work_record_students (work_record_id, enrollment_id, participant_role)
select v.work_record_id, v.enrollment_id, 'participant'
from (values
${rows
  .flatMap((r) => r.enrollments.map((e) => `  (${q(r.id)}::uuid, ${q(e)}::uuid)`))
  .join(",\n")}
) as v(work_record_id, enrollment_id)
where not exists (
  select 1 from public.work_record_students x where x.work_record_id = v.work_record_id and x.enrollment_id = v.enrollment_id
);

do $$
declare
  n_records integer;
  n_links integer;
  n_minjun integer;
begin
  select count(*) into n_records from public.work_records
   where id::text >= ${q(firstId)} and id::text <= ${q(lastId)} and record_type = 'general' and status = 'sealed' and created_by = ${q(TEACHER_ID)};
  if n_records <> ${rows.length} then
    raise exception '시드 검증 실패: 새 관찰일지가 ${rows.length}건이어야 하는데 % 건이다', n_records;
  end if;

  select count(*) into n_links from public.work_record_students
   where work_record_id::text >= ${q(firstId)} and work_record_id::text <= ${q(lastId)};
  if n_links <> ${linkTotal} then
    raise exception '시드 검증 실패: 학생 태그가 ${linkTotal}건이어야 하는데 % 건이다', n_links;
  end if;

  select count(*) into n_minjun from public.work_record_students
   where work_record_id::text >= ${q(firstId)} and work_record_id::text <= ${q(lastId)} and enrollment_id = ${q(enrollment(MINJUN_NO))};
  if n_minjun <> 0 then
    raise exception '시드 검증 실패: 김민준은 태그하지 않아야 한다';
  end if;
end;
$$;

commit;
`;
}

// 직접 실행하면 SQL을 표준출력으로 낸다(다른 파일에서 import할 때는 실행하지 않는다).
import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(buildSql());
}
