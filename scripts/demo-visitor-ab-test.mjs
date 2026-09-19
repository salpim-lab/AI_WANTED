// 담당: 이지현 (제안) — 공개 데모 방문자 격리 통합 테스트 (앱 경로 A/B + 동시 체크인 회귀).
//
// 실제 Supabase 익명 계정 2개(방문자 A, B)를 만들어 로컬/스테이징 서버에 쿠키로 접속한다. 프레임워크 없이 node만 쓴다.
//   1) DEMO_MODE=true 로 서버를 띄운다:   DEMO_MODE=true npm run start        (빌드 후, 기본 http://localhost:3000)
//   2) 다른 터미널에서:                    node scripts/demo-visitor-ab-test.mjs [서버주소]
// 필요: .env.local 의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Supabase의 Anonymous Sign-Ins 켜짐,
//       캡차 꺼짐(캡차가 켜져 있으면 서버 밖에서 익명 로그인을 못 한다).
// 3D 섬(1094) 구간: 1094가 공유 DB에 적용돼 있어야 실행된다(미적용이면 SKIP으로 표시하고 나머지는 그대로 실행). 아이템 생성 경로를 타므로 AI 호출이 생긴다.
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

let pass = 0, fail = 0, skipped = 0;
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

// ============================================================================
// ---- 3D 섬(1094): 공용 배치 + 방문자 개인 배치 격리 ----
// 전제: 1094 마이그레이션이 적용돼 있어야 한다(적용 전이면 이 구간은 SKIP — 위 기존 검사는 그대로 유효).
// 이 구간은 실제 아이템 생성 경로(POST /api/ai/item-generation)를 타므로 방문자마다 AI 호출이 1~2회 생긴다(AI 미설정이면 폴백 아이템).
// ============================================================================
const skip = (name, why) => { skipped++; console.log(`SKIP  ${name}  — ${why}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const islandGet = async (v) => { const r = await call(v, "/api/island"); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const islandSend = (v, method, body) => call(v, "/api/island", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const probe = await islandGet(A);
if (probe.status !== 200 || probe.body.persisted !== true) {
  skip("3D 섬 A/B 전체", `GET /api/island → ${probe.status} persisted=${probe.body.persisted} (1094 미적용이거나 DEMO_MODE가 꺼져 있다)`);
} else {
  const { createJiti } = await import("jiti");
  const { fileURLToPath } = await import("node:url");
  const jiti = createJiti(import.meta.url, { interopDefault: false, fsCache: false, alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } });
  const rules = (await jiti.import("../src/components/student/island/placementRules.ts")).getPlacementRules();
  const medium = { assetFormat: "procedural", geometrySpec: {} };
  const freeSpots = (occupied, count) => {
    const spots = [], taken = [...occupied];
    for (let x = rules.bounds.minX; x <= rules.bounds.maxX && spots.length < count; x += 0.7) {
      for (let z = rules.bounds.minZ; z <= rules.bounds.maxZ && spots.length < count; z += 0.7) {
        if (!rules.canPlace(x, z, medium, taken)) continue;
        const spot = { x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000 };
        spots.push(spot); taken.push({ id: `spot-${spots.length}`, ...spot, ...medium });
      }
    }
    return spots;
  };
  const waitItem = async (v, sessionId, timeoutMs = 150_000) => {
    await jsonPost(v, "/api/ai/item-generation", { session_id: sessionId });
    for (const start = Date.now(); Date.now() - start < timeoutMs; await sleep(1000)) {
      const job = (await (await call(v, `/api/ai/item-generation?session_id=${sessionId}`)).json().catch(() => ({}))).job;
      if (job?.student_item_id) return job.student_item_id;
    }
    return null;
  };
  const key = (g) => `${g.id}@${g.x},${g.z}`;

  // 체크인 2회(A) + 1회(B): 아침 세션은 위에서 전문을 저장했고, A의 오후 세션(동시 체크인 회귀에서 만든 것)에도 전문을 저장해 두 번째 아이템을 만든다.
  check("A 오후 세션 전문 저장 200", (await jsonPost(A, "/api/checkins/transcript", { session_id: raceIdA, status: "completed", transcript: turns(`${MARK_A}-PM`) })).status === 200);
  // 동시 지급: A와 B가 같은 enrollment·같은 날에 동시에 아이템을 받아도 슬롯 충돌 없이 둘 다 성공(소유자별 슬롯 인덱스)
  const [a1, b1] = await Promise.all([waitItem(A, sA.session_id), waitItem(B, sB.session_id)]);
  check("동시 지급: A·B 모두 아이템 지급 성공(슬롯 충돌 없음)", !!a1 && !!b1 && a1 !== b1);
  const a2 = await waitItem(A, raceIdA);
  check("A의 두 번째 체크인 아이템 지급", !!a2 && a2 !== a1);

  // 신규 아이템의 demo_owner_id 누락 검증(앱 경로): REST로 본인 행을 읽어 소유자가 정확히 내 uid인지
  const ownRows = async (v, ids) => (await (await rest(v, `student_items?select=id,demo_owner_id,is_public_demo,asset_id,source_session_id&id=in.(${ids.join(",")})`)).json());
  const rowsA = await ownRows(A, [a1, a2].filter(Boolean)), rowsB = await ownRows(B, [b1].filter(Boolean));
  check("신규 아이템 demo_owner_id 누락 없음(A 2건 = A uid)", Array.isArray(rowsA) && rowsA.length === 2 && rowsA.every((r) => r.demo_owner_id === A.uid && r.is_public_demo === false));
  check("신규 아이템 demo_owner_id 누락 없음(B 1건 = B uid)", Array.isArray(rowsB) && rowsB.length === 1 && rowsB.every((r) => r.demo_owner_id === B.uid));
  check("B는 A의 student_items를 REST로 조회할 수 없다", ((await (await rest(B, `student_items?select=id&id=in.(${[a1, a2].join(",")})`)).json()) || []).length === 0);

  // 공용 배치: A·B에게 동일, 모두 locked, 부모 정보 없음
  const pubA = (await islandGet(A)).body.gifts.filter((g) => g.locked), pubB = (await islandGet(B)).body.gifts.filter((g) => g.locked);
  check("공용 배치가 A·B에게 동일하다(id·좌표)", JSON.stringify(pubA.map(key).sort()) === JSON.stringify(pubB.map(key).sort()), `공용 ${pubA.length}개`);
  const allowedKeys = new Set(["id", "kind", "name", "x", "z", "assetFormat", "geometrySpec", "locked"]);
  const rawA = JSON.stringify((await islandGet(A)).body);
  check("섬 응답에 name·모양·좌표 외의 필드(session/job/inference/owner)가 없다", (await islandGet(A)).body.gifts.every((g) => Object.keys(g).every((k) => allowedKeys.has(k))));
  check("섬 응답에 발화 문구(MARK)가 없다", !rawA.includes(MARK_A) && !rawA.includes(MARK_B));
  if (pubA.length === 0) skip("공용 배치 대조군(공용 이동·삭제·겹침 거부 등)", "공용 시드가 아직 없다(시드 INSERT 전)");

  // 배치·이동·삭제
  const spots = freeSpots(pubA, 4);
  check("테스트용 빈 자리 4곳 확보", spots.length === 4);
  const place = async (v, id, spot) => (await islandSend(v, "POST", { student_item_id: id, ...spot })).status;
  check("A가 자기 아이템 a1 배치 → 200", (await place(A, a1, spots[0])) === 200);
  check("A가 같은 자리에 두 번째 아이템 a2 → 409(내 배치와 겹침)", (await place(A, a2, spots[0])) === 409);
  check("A가 a2를 다른 자리에 배치 → 200", (await place(A, a2, spots[1])) === 200);
  check("A가 a1을 다른 자리로 이동(다시 놓기) → 200", (await place(A, a1, spots[2])) === 200);
  const mineA = (await islandGet(A)).body.gifts.filter((g) => !g.locked);
  check("A 섬: 내 배치 2개(중복 배치 없음), 이동 반영", mineA.length === 2 && mineA.some((g) => g.id === a1 && g.x === spots[2].x && g.z === spots[2].z) && mineA.some((g) => g.id === a2), JSON.stringify(mineA.map(key)));
  check("B가 A와 같은 좌표에 자기 아이템 배치 → 200(다른 방문자 배치는 겹침 판정에 없음)", (await place(B, b1, spots[2])) === 200);
  const mineB = (await islandGet(B)).body.gifts.filter((g) => !g.locked);
  check("B 섬에는 B의 배치만 있다(A의 배치 없음)", mineB.length === 1 && mineB[0].id === b1);
  check("A 섬에는 B의 배치가 없다", !(await islandGet(A)).body.gifts.some((g) => g.id === b1));

  // 공격 시도
  check("A가 B의 아이템을 배치 시도 → 404", (await place(A, b1, spots[3])) === 404);
  check("B가 A의 배치를 삭제 시도 → 404", (await islandSend(B, "DELETE", { student_item_id: a1 })).status === 404);
  if (pubA.length) {
    check("A가 공용 아이템을 이동 시도 → 403", (await place(A, pubA[0].id, spots[3])) === 403);
    check("A가 공용 아이템 배치를 삭제 시도 → 403", (await islandSend(A, "DELETE", { student_item_id: pubA[0].id })).status === 403);
    check("A가 공용 배치 자리에 내 아이템 배치 → 409", (await place(A, a2, { x: pubA[0].x, z: pubA[0].z })) === 409);
    const pubAfter = (await islandGet(B)).body.gifts.filter((g) => g.locked);
    check("시도 뒤에도 공용 배치가 그대로다", JSON.stringify(pubAfter.map(key).sort()) === JSON.stringify(pubA.map(key).sort()));
  }
  check("잘못된 좌표(범위 밖) → 400", (await place(A, a1, { x: 99999, z: 0 })) === 400);
  check("세션 없는 배치 요청 → 401/403/리다이렉트", [401, 403, 307].includes((await islandSend(null, "POST", { student_item_id: a1, ...spots[0] })).status));

  // 직접 REST(PostgREST)
  const restRows = async (v, path) => { const rows = await (await rest(v, path)).json(); return Array.isArray(rows) ? rows : null; };
  const placedB = await restRows(B, "island_placements?select=student_item_id");
  check("B의 REST 직접 조회: 배치는 공용 + B 것만", placedB !== null && placedB.every((r) => [...pubB.map((g) => g.id), b1].includes(r.student_item_id)) && !placedB.some((r) => r.student_item_id === a1 || r.student_item_id === a2));
  const islandsB = await restRows(B, "islands?select=id,demo_owner_id,is_public_demo");
  check("B의 REST 직접 조회: 섬은 공용 + B 것만", islandsB !== null && islandsB.every((r) => r.is_public_demo || r.demo_owner_id === B.uid));
  check("REST로 배치 수정/삭제 시도 → 차단", [401, 403].includes((await rest(A, `island_placements?student_item_id=eq.${a1}`, { method: "PATCH", body: JSON.stringify({ position_x: 0 }) })).status)
    && [401, 403].includes((await rest(A, `island_placements?student_item_id=eq.${a1}`, { method: "DELETE" })).status));
  if (pubA.length) check("REST로 공용 배치 수정 시도 → 차단", [401, 403].includes((await rest(A, `island_placements?student_item_id=eq.${pubA[0].id}`, { method: "PATCH", body: JSON.stringify({ position_x: 0 }) })).status));
  check("REST RPC place_demo_item / remove_demo_placement 직접 호출 → 차단", [401, 403, 404].includes((await rest(A, "rpc/place_demo_item", { method: "POST", body: JSON.stringify({ p_owner_id: A.uid, p_item_id: a1, p_x: 0, p_z: 0, p_radius: 0.1 }) })).status)
    && [401, 403, 404].includes((await rest(A, "rpc/remove_demo_placement", { method: "POST", body: JSON.stringify({ p_owner_id: A.uid, p_item_id: a1 }) })).status));

  // asset_catalog(E-3): B가 A 전용 자산의 name·geometry를 직접 REST로 조회해도 0건 (A와 B가 공유하지 않는 자산 한정)
  const shared = new Set((rowsB || []).map((r) => r.asset_id));
  ((await restRows(B, "student_items?select=asset_id&is_public_demo=eq.true")) || []).forEach((r) => shared.add(r.asset_id));
  const aOnly = [...new Set(rowsA.map((r) => r.asset_id))].filter((id) => !shared.has(id));
  if (aOnly.length === 0) skip("B가 A 전용 자산을 직접 REST로 조회 → 0건", "A와 B가 같은 자산을 받아(폴백 선물 상자/같은 이름 아이템) 비교 대상이 없다");
  else {
    const byId = await restRows(B, `asset_catalog?select=id,name,geometry_spec&id=in.(${aOnly.join(",")})`);
    check("B가 A 전용 자산을 id로 직접 REST 조회 → 0건", byId !== null && byId.length === 0, `대상 ${aOnly.length}종`);
    const own = await restRows(A, `asset_catalog?select=id,name&id=in.(${aOnly.join(",")})`);
    const names = (own || []).map((r) => r.name);
    check("(대조군) A는 자기 자산을 조회할 수 있다", names.length === aOnly.length);
    const byName = names.length ? await restRows(B, `asset_catalog?select=name,geometry_spec&name=in.(${names.map((n) => `"${n}"`).join(",")})`) : [];
    check("B가 A 전용 자산을 name으로 조회 → 0건(name·geometry_spec 모두)", byName !== null && byName.length === 0);
    const listB = await restRows(B, "asset_catalog?select=id");
    check("B의 asset_catalog 전체 목록에 A 전용 자산이 없다", listB !== null && !listB.some((r) => aOnly.includes(r.id)));
  }
  check("(대조군) B는 자기 아이템의 자산을 조회할 수 있다", ((await restRows(B, `asset_catalog?select=id&id=in.(${(rowsB || []).map((r) => r.asset_id).join(",")})`)) || []).length >= 1);
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail} / SKIP ${skipped}`);
process.exit(fail ? 1 : 0);
