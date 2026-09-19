// 담당: 이지현 (제안) — 공개 데모 방문자 격리 통합 테스트 (앱 경로 A/B + 동시 체크인 회귀).
//
// 실제 Supabase 익명 계정 2개(방문자 A, B)를 만들어 로컬/스테이징 서버에 쿠키로 접속한다. 프레임워크 없이 node만 쓴다.
//   1) DEMO_MODE=true 로 서버를 띄운다:   DEMO_MODE=true npm run start        (빌드 후, 기본 http://localhost:3000)
//   2) 다른 터미널에서:                    node scripts/demo-visitor-ab-test.mjs [서버주소]
// 필요: .env.local 의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Supabase의 Anonymous Sign-Ins 켜짐,
//       캡차 꺼짐(캡차가 켜져 있으면 서버 밖에서 익명 로그인을 못 한다).
// 남는 것: 테스트마다 익명 계정 2개·프로필·체크인·상담 신청이 공유 DB에 남는다(봉인/불변이라 지워지지 않음) — 자주 돌리지 말 것.
// 비밀값(토큰·쿠키)은 출력하지 않는다. 실패가 하나라도 있으면 종료 코드 1.
import { createRequire } from "node:module";
import fs from "node:fs";

const ROOT = process.cwd();
const require = createRequire(`${ROOT}/package.json`);
const { createServerClient } = require("@supabase/ssr");

const env = Object.fromEntries(
  fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const BASE = process.argv[2] || "http://localhost:3000";
const RUN = Math.random().toString(36).slice(2, 7);
const MARK_A = `MARK-A-${RUN}`;
const MARK_B = `MARK-B-${RUN}`;
const MINJUN = "00000000-0000-4000-8000-000000000001"; // 교사 화면(mock 명단)의 민준 student_id
// 공용 시드에만 있는 문장(2026-09-10 등교) — "화면이 원문 발화를 아예 못 그리는" 공허한 통과를 막는 대조군
const SEED_DATE = "2026-09-10";
const SEED_LINE = "발표 잘했어요";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

async function newVisitor(label) {
  const jar = new Map();
  const supabase = createServerClient(SUPA, PUB, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)) },
  });
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`${label} 익명 로그인 실패: ${error.message} (Anonymous Sign-Ins가 켜져 있고 캡차가 꺼져 있어야 함)`);
  return { label, uid: data.user.id, token: data.session.access_token, cookie: [...jar].map(([n, v]) => `${n}=${v}`).join("; ") };
}
const call = (v, path, init = {}) => fetch(BASE + path, { ...init, headers: { ...(init.headers || {}), cookie: v ? v.cookie : "" }, redirect: "manual" });
const jsonPost = (v, path, body) => call(v, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const rest = (v, path, init = {}) => fetch(`${SUPA}/rest/v1/${path}`, { ...init, headers: { apikey: PUB, Authorization: `Bearer ${v.token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
const turns = (mark) => [
  { content: "오늘은 어땠어?", speaker: "assistant", input_method: "fixed" },
  { content: `${mark} 오늘 있었던 일을 말해요`, speaker: "student", input_method: "text" },
];
const pageText = async (v, path) => { const r = await call(v, path); return { status: r.status, text: r.status === 200 ? await r.text() : "" }; };

console.log(`== 대상 ${BASE} | run=${RUN} ==`);
const A = await newVisitor("A");
const B = await newVisitor("B");
check("익명 계정 2개 생성(서로 다른 uid)", A.uid !== B.uid);

// ---- 초기화·게이트 ----
check("세션 없는 /api/demo/init → 401", (await jsonPost(null, "/api/demo/init", {})).status === 401);
const gate = await call(null, "/dashboard");
check("세션 없는 /dashboard → /demo-init 리다이렉트", gate.status === 307 && (gate.headers.get("location") || "").includes("/demo-init"));
for (const v of [A, B]) {
  check(`${v.label}: /api/demo/init 200`, (await jsonPost(v, "/api/demo/init", {})).status === 200);
  check(`${v.label}: /api/demo/init 재호출도 200(멱등)`, (await jsonPost(v, "/api/demo/init", {})).status === 200);
}

// ---- 동시 체크인 회귀: 같은 방문자가 같은 슬롯을 동시에 여러 번 ----
// 기대: 전부 200 이고 전부 같은 세션 id(멱등). 예전엔 부분 유니크 인덱스 충돌(23505)이 500으로 새어 나갔다.
const N = 5;
const [raceA, raceB] = await Promise.all([A, B].map((v) =>
  Promise.all(Array.from({ length: N }, () => jsonPost(v, "/api/checkins/session", { period: "afternoon", mood_color: v === A ? "yellow" : "green" })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))))));
for (const [v, race] of [[A, raceA], [B, raceB]]) {
  const ids = new Set(race.map((r) => r.body.session_id));
  check(`${v.label}: 동시 ${N}회 → 전부 200`, race.every((r) => r.status === 200), JSON.stringify(race.map((r) => r.status)));
  check(`${v.label}: 동시 ${N}회 → 전부 같은 세션 id(멱등)`, ids.size === 1 && !ids.has(undefined), `distinct=${ids.size}`);
}
const raceIdA = raceA[0].body.session_id, raceIdB = raceB[0].body.session_id;
check("A와 B의 동시 요청은 서로 다른 세션", raceIdA !== raceIdB);
// 반환된 세션이 "호출자 본인 소유"인지(공용 시드·타인 세션을 돌려주지 않음) — RLS 클라이언트로 본인 것만 읽힌다
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
for (const [v, race, id, otherId] of [[A, raceA, raceIdA, raceIdB], [B, raceB, raceIdB, raceIdA]]) {
  const own = await (await rest(v, `checkin_sessions?select=id,demo_owner_id,enrollment_id,session_date,period,attempt&id=eq.${id}`)).json();
  check(`${v.label}: 반환된 세션은 본인 소유(demo_owner_id = 내 uid)`, Array.isArray(own) && own.length === 1 && own[0].demo_owner_id === v.uid);
  // 유니크 키(소유자·enrollment·날짜·시간대·attempt)가 요청한 슬롯과 정확히 일치 — "내 최신 세션"이 아니라 그 슬롯이어야 한다
  const row = own?.[0] || {};
  check(`${v.label}: 반환된 세션이 요청한 슬롯과 정확히 일치(날짜=${today}, 시간대=afternoon, attempt=1, 응답 attempt와 DB 일치)`,
    row.session_date === today && row.period === "afternoon" && row.attempt === 1 && race.every((r) => r.body.attempt === row.attempt));
  const foreign = await (await rest(v, `checkin_sessions?select=id&id=eq.${otherId}`)).json();
  check(`${v.label}: 상대 세션은 조회되지 않음`, Array.isArray(foreign) && foreign.length === 0);
}

// ---- 학생: 아침 체크인 시작·전문 저장 ----
const sA = await (await jsonPost(A, "/api/checkins/session", { period: "morning", mood_color: "red" })).json();
const sB = await (await jsonPost(B, "/api/checkins/session", { period: "morning", mood_color: "green" })).json();
check("A/B 각자 체크인 세션 생성", !!sA.session_id && !!sB.session_id && sA.session_id !== sB.session_id);
check("A 본인 세션 전문 저장 200", (await jsonPost(A, "/api/checkins/transcript", { session_id: sA.session_id, status: "completed", transcript: turns(MARK_A) })).status === 200);
check("B 본인 세션 전문 저장 200", (await jsonPost(B, "/api/checkins/transcript", { session_id: sB.session_id, status: "completed", transcript: turns(MARK_B) })).status === 200);

// ---- 타인 세션 접근 시도 ----
const attacks = [
  ["A→B 세션 전문 저장", () => jsonPost(A, "/api/checkins/transcript", { session_id: sB.session_id, status: "completed", transcript: turns("HACK") })],
  ["A→B 세션 상담 신청", () => jsonPost(A, "/api/checkins/meeting-request", { session_id: sB.session_id })],
  ["A→B 세션 아이템 생성 조회", () => call(A, `/api/ai/item-generation?session_id=${sB.session_id}`)],
  ["A→B 세션 아이템 생성 접수", () => jsonPost(A, "/api/ai/item-generation", { session_id: sB.session_id })],
  ["B→A 세션 전문 저장", () => jsonPost(B, "/api/checkins/transcript", { session_id: sA.session_id, status: "completed", transcript: turns("HACK") })],
  ["B→A 세션 상담 신청", () => jsonPost(B, "/api/checkins/meeting-request", { session_id: sA.session_id })],
];
for (const [name, fn] of attacks) check(`차단: ${name}`, [403, 404].includes((await fn()).status));

// ---- 상담 신청: 본인 것만 ----
check("A 본인 세션 상담 신청 성공", (await jsonPost(A, "/api/checkins/meeting-request", { session_id: sA.session_id })).status === 200);
const listA = await (await call(A, "/api/teacher/meeting-requests")).json();
const listB = await (await call(B, "/api/teacher/meeting-requests")).json();
check("A의 교사용 신청 목록에 A 것 포함", (listA.items || []).some((i) => i.sessionId === sA.session_id));
check("B의 교사용 신청 목록에 A 신청이 없음", !(listB.items || []).some((i) => i.sessionId === sA.session_id));
const idOfA = (listA.items || []).find((i) => i.sessionId === sA.session_id)?.id;
if (idOfA) check("B가 A의 신청을 확인 처리 시도 → 404", (await jsonPost(B, "/api/teacher/meeting-requests", { id: idOfA })).status === 404);

// ---- 교사 화면(HTML) — 대조군 포함(공허한 통과 방지) ----
for (const [v, mine, other] of [[A, MARK_A, MARK_B], [B, MARK_B, MARK_A]]) {
  const today = await pageText(v, `/students/${MINJUN}`);
  check(`${v.label}: 학생 상세(오늘) 200`, today.status === 200);
  check(`${v.label}: 학생 상세(오늘)에 내 문장이 보임(화면이 원문 발화를 그린다는 증거)`, today.text.includes(mine));
  check(`${v.label}: 학생 상세(오늘)에 상대 문장이 없음`, !today.text.includes(other));
  const seed = await pageText(v, `/students/${MINJUN}?date=${SEED_DATE}`);
  check(`${v.label}: 학생 상세(${SEED_DATE})에 공용 시드 문장이 보임(대조군)`, seed.text.includes(SEED_LINE));
  check(`${v.label}: 학생 상세(${SEED_DATE})에도 상대 문장은 없음`, !seed.text.includes(other));
  const obs = await pageText(v, `/observation?q=${encodeURIComponent("핸드볼")}`);
  check(`${v.label}: 관찰일지 검색에 승격된 갈등 기록이 보임`, obs.status === 200 && obs.text.includes("핸드볼"));
  check(`${v.label}: 상담 화면 200`, (await pageText(v, "/consultation")).status === 200);
  check(`${v.label}: 대시보드 200`, (await pageText(v, "/dashboard")).status === 200);
}

// ---- Supabase 직접 호출(방문자 토큰) ----
for (const v of [A, B]) {
  const rows = await (await rest(v, "checkin_sessions?select=id,demo_owner_id&demo_owner_id=not.is.null")).json();
  check(`${v.label}: REST 직접 조회 — 본인 소유 행만`, rows.filter((r) => r.demo_owner_id === v.uid).length >= 1 && rows.every((r) => r.demo_owner_id === v.uid));
  const other = v === A ? sB.session_id : sA.session_id;
  check(`${v.label}: REST로 상대 세션 수정 시도 → 차단`, [401, 403].includes((await rest(v, `checkin_sessions?id=eq.${other}`, { method: "PATCH", body: JSON.stringify({ status: "stopped" }) })).status));
  check(`${v.label}: REST students.login_code → 차단`, [401, 403].includes((await rest(v, "students?select=login_code&limit=1")).status));
  const jobs = await (await rest(v, "item_generation_jobs?select=id")).json();
  check(`${v.label}: REST item_generation_jobs 0건`, Array.isArray(jobs) && jobs.length === 0);
  const conf = await (await rest(v, "work_records?select=id&record_type=eq.conflict")).json();
  check(`${v.label}: REST 갈등 기록은 승격된 4건만`, Array.isArray(conf) && conf.length === 4, `n=${Array.isArray(conf) ? conf.length : "err"}`);
  check(`${v.label}: REST RPC increment_ai_rate_limit → 차단`, [401, 403, 404].includes((await rest(v, "rpc/increment_ai_rate_limit", { method: "POST", body: JSON.stringify({ p_subject: "x", p_window_seconds: 0, p_max_calls: 1 }) })).status));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
