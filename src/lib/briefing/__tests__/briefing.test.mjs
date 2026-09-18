// node --test src/lib/briefing/__tests__/briefing.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

// 소스는 확장자 없는 TS import 를 쓰므로 node 기본 로더로는 못 읽는다 (island 테스트와 같은 방식).
// tsconfig 의 "@/*" 별칭은 jiti 가 모르므로 여기서 알려준다.
const jiti = createJiti(import.meta.url, {
  interopDefault: false,
  fsCache: false,
  alias: { "@": fileURLToPath(new URL("../../..", import.meta.url)) },
});
const { BASELINE_MIN_DAYS, deviation, mad, median, scoreOf } = await jiti.import("../baseline.ts");
const { detectTriggers, selectBriefing, THRESHOLD, TRIGGER_ORDER } = await jiti.import("../triggers.ts");
const { BANNED_PATTERNS, renderBriefingLine, reasonOf, statusOf } = await jiti.import("../templates.ts");

const TODAY = "2026-09-18";

/** 오늘 이전 n 수업일치 기록을 같은 색으로 채운다 (오래된 날 → 최근 날) */
function history(colors) {
  return colors.map((color, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, color }));
}
const repeat = (color, n) => Array.from({ length: n }, () => color);

const baseFacts = (over = {}) => ({
  studentId: 1,
  name: "김민준",
  todayColor: "green",
  history: history(repeat("green", 20)),
  ...over,
});

/* ══ 기준선 산수 ══════════════════════════════════════════════════ */

test("median 과 mad 는 튀는 날 하나에 흔들리지 않는다", () => {
  assert.equal(median([1, 2, 3, 4, 5]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  // 평균이라면 3 → 2.2 로 끌려가지만 중앙값은 그대로 3
  assert.equal(median([3, 3, 3, 3, 1]), 3);
  assert.equal(mad([3, 3, 3, 3, 3]), 0);
});

test("기록이 14일 미만이면 편차를 내지 않는다 (콜드스타트)", () => {
  assert.equal(deviation(1, repeat(3, BASELINE_MIN_DAYS - 1)), null);
  assert.notEqual(deviation(1, repeat(3, BASELINE_MIN_DAYS)), null);
});

test("늘 같은 색만 골라온 아이가 다른 색을 고르면 가장 이례적으로 잡힌다", () => {
  const dev = deviation(scoreOf("yellow"), repeat(scoreOf("green"), 20));
  assert.ok(dev !== null && dev < THRESHOLD.baselineDeviation, `MAD=0 에서도 편차가 나와야 한다 (${dev})`);
});

test("늘 빨강인 아이의 빨강은 이례적이지 않다", () => {
  const dev = deviation(scoreOf("red"), repeat(scoreOf("red"), 20));
  assert.equal(dev, 0);
});

/* ══ 규칙 ════════════════════════════════════════════════════════ */

test("늘 초록이던 아이의 노랑이 기준선으로 잡힌다 — 학급 절대값이면 놓친다", () => {
  const kinds = detectTriggers(baseFacts({ todayColor: "yellow" }), TODAY).map((t) => t.kind);
  assert.ok(kinds.includes("baseline"), kinds.join(","));
});

test("늘 빨강이던 아이의 빨강은 기준선으로 잡히지 않는다", () => {
  const facts = baseFacts({ todayColor: "red", history: history(repeat("red", 20)) });
  const kinds = detectTriggers(facts, TODAY).map((t) => t.kind);
  assert.ok(!kinds.includes("baseline"), "평소와 같은 날을 이례적이라 하면 안 된다");
});

test("두 단계 하락은 drop, 한 단계는 dip", () => {
  const drop = detectTriggers(baseFacts({ todayColor: "red" }), TODAY);
  assert.equal(drop[0].kind, "drop");
  const dip = detectTriggers(baseFacts({ todayColor: "yellow" }), TODAY);
  assert.ok(dip.some((t) => t.kind === "dip" || t.kind === "baseline"));
});

test("남색은 색 앵커에서 빠져 하락으로 계산되지 않는다", () => {
  const kinds = detectTriggers(baseFacts({ todayColor: "navy" }), TODAY).map((t) => t.kind);
  assert.ok(!kinds.includes("drop") && !kinds.includes("dip"), kinds.join(","));
});

test("면담 요청은 어떤 집계보다 먼저 온다", () => {
  const facts = baseFacts({
    todayColor: "red",
    meetingRequest: { requestedOn: "2026-09-17", priority: "normal" },
  });
  assert.equal(detectTriggers(facts, TODAY)[0].kind, "meetingRequest");
});

test("색 축 트리거는 하나만 남는다 — 같은 사실을 두 번 말하지 않는다", () => {
  // 초록에서 빨강으로 떨어지면 drop 과 baseline 이 같이 발화한다
  const colorAxis = detectTriggers(baseFacts({ todayColor: "red" }), TODAY).filter((t) =>
    ["drop", "dip", "baseline", "streak"].includes(t.kind),
  );
  assert.equal(colorAxis.length, 1, colorAxis.map((t) => t.kind).join(","));
});

test("연속은 오늘 포함해서 세고, 초록 연속은 올리지 않는다", () => {
  const red = baseFacts({ todayColor: "red", history: history([...repeat("green", 17), "red", "red"]) });
  const streak = detectTriggers(red, TODAY).find((t) => t.kind === "streak");
  assert.equal(streak.days, 3);
  const green = detectTriggers(baseFacts(), TODAY).map((t) => t.kind);
  assert.ok(!green.includes("streak"), "잘 지내는 연속은 브리핑에 올리지 않는다");
});

test("초록을 눌렀지만 힘든 말을 했으면 색보다 먼저 잡힌다", () => {
  const facts = baseFacts({
    todayColor: "green",
    todayLemmas: [{ lemma: "속상하다", quote: "진짜 속상했어요" }],
  });
  const triggers = detectTriggers(facts, TODAY);
  assert.equal(triggers[0].kind, "colorWordGap");
  // 아이 말은 요약하지 않고 그대로 나온다
  assert.ok(reasonOf(triggers[0]).includes("진짜 속상했어요"), reasonOf(triggers[0]));
});

test("초록에 좋은 말이면 어긋난 게 아니다", () => {
  const facts = baseFacts({ todayColor: "green", todayLemmas: [{ lemma: "뿌듯하다" }] });
  assert.deepEqual(detectTriggers(facts, TODAY), []);
});

test("빨강에 힘든 말은 어긋난 게 아니다 — 색과 말이 같은 방향이다", () => {
  const facts = baseFacts({
    todayColor: "red",
    history: history(repeat("red", 20)),
    todayLemmas: [{ lemma: "속상하다", quote: "속상했어요" }],
  });
  const kinds = detectTriggers(facts, TODAY).map((t) => t.kind);
  assert.ok(!kinds.includes("colorWordGap"), kinds.join(","));
});

test("처음 쓴 힘든 말만 올린다 — 좋은 말을 처음 쓴 건 브리핑 일이 아니다", () => {
  const hard = baseFacts({ newLemmas: ["외롭다"], todayLemmas: [{ lemma: "외롭다" }] });
  assert.ok(detectTriggers(hard, TODAY).some((t) => t.kind === "firstHardWord"));
  const good = baseFacts({ newLemmas: ["뿌듯하다"], todayLemmas: [{ lemma: "뿌듯하다" }] });
  assert.deepEqual(detectTriggers(good, TODAY), []);
});

test("체크인이 없으면 색 규칙 대신 noCheckin 하나만", () => {
  const kinds = detectTriggers(baseFacts({ todayColor: null }), TODAY).map((t) => t.kind);
  assert.deepEqual(kinds, ["noCheckin"]);
});

test("평소와 같은 아이는 트리거가 하나도 없다", () => {
  assert.deepEqual(detectTriggers(baseFacts(), TODAY), []);
});

/* ══ 선정 ════════════════════════════════════════════════════════ */

test("트리거가 없는 아이는 브리핑에 오르지 않고, 정원까지만 자른다", () => {
  const everyone = [
    baseFacts({ studentId: 1, name: "김민준", todayColor: "red" }),
    baseFacts({ studentId: 2, name: "이서연", todayColor: "yellow" }),
    baseFacts({ studentId: 3, name: "박예린", todayColor: null }),
    baseFacts({ studentId: 4, name: "최하준" }), // 평소대로 — 안 올라간다
    baseFacts({ studentId: 5, name: "정지우", todayColor: "yellow" }),
  ];
  const picked = selectBriefing(everyone, TODAY, 3);
  assert.equal(picked.length, 3);
  assert.ok(!picked.some((p) => p.facts.name === "최하준"));
});

test("같은 데이터를 두 번 돌리면 같은 순서가 나온다", () => {
  const everyone = ["이서연", "김민준", "박예린"].map((name, i) =>
    baseFacts({ studentId: i + 1, name, todayColor: "yellow" }),
  );
  const once = selectBriefing(everyone, TODAY).map((p) => p.facts.name);
  const twice = selectBriefing(everyone, TODAY).map((p) => p.facts.name);
  assert.deepEqual(once, twice);
});

/* ══ 문구 ════════════════════════════════════════════════════════ */

test("모든 트리거가 status 와 reason 을 가진다", () => {
  const samples = [
    { kind: "meetingRequest", requestedOn: "2026-09-17", daysWaiting: 1, urgent: false },
    { kind: "meetingRequest", requestedOn: TODAY, daysWaiting: 0, urgent: true },
    { kind: "colorWordGap", color: "green", lemma: "속상하다", quote: "속상했어요" },
    { kind: "colorWordGap", color: "green", lemma: "속상하다" },
    { kind: "firstHardWord", lemma: "외롭다", quote: "혼자 있는 게 외로웠어요" },
    { kind: "firstHardWord", lemma: "외롭다" },
    { kind: "drop", from: "green", to: "red" },
    { kind: "dip", from: "green", to: "yellow" },
    { kind: "baseline", rareWeeks: 3, lastSeenOn: "2026-08-28" },
    { kind: "baseline", rareWeeks: null, lastSeenOn: null },
    { kind: "afterConflict", date: "2026-09-17", resolved: false },
    { kind: "afterConflict", date: "2026-09-17", resolved: true },
    { kind: "streak", color: "red", days: 2, since: "2026-09-17" },
    { kind: "streak", color: "red", days: 6, since: "2026-09-10" },
    { kind: "quiet", speech: true, latency: true },
    { kind: "quiet", speech: false, latency: true },
    { kind: "noCheckin", days: 3, since: "2026-09-15" },
    { kind: "noCheckin", days: 1, since: TODAY },
    { kind: "noEmotionWord", sessions: 3 },
    { kind: "noPeerMention", weeks: 3 },
    { kind: "navyRepeat", count: 4, consecutive: 0 },
    { kind: "navyRepeat", count: 4, consecutive: 2 },
  ];
  assert.equal(new Set(samples.map((s) => s.kind)).size, TRIGGER_ORDER.length, "모든 종류를 덮어야 한다");
  for (const t of samples) {
    assert.ok(statusOf(t)?.trim(), `${t.kind} status`);
    assert.ok(reasonOf(t)?.trim(), `${t.kind} reason`);
  }
});

test("문구에 진단·추측·비교·예측 표현이 없다", () => {
  const samples = [
    { kind: "drop", from: "green", to: "red" },
    { kind: "baseline", rareWeeks: 3, lastSeenOn: "2026-08-28" },
    { kind: "streak", color: "red", days: 6, since: "2026-09-10" },
    { kind: "quiet", speech: true, latency: true },
    { kind: "navyRepeat", count: 4, consecutive: 2 },
    { kind: "afterConflict", date: "2026-09-17", resolved: true },
    { kind: "noEmotionWord", sessions: 3 },
  ];
  for (const t of samples) {
    const text = `${statusOf(t)} ${reasonOf(t)}`;
    for (const { label, pattern } of BANNED_PATTERNS) {
      assert.ok(!pattern.test(text), `${t.kind} 에 ${label} 표현: "${text}"`);
    }
  }
});

test("reason 문구 안에는 이음 기호가 없다 — 두 개를 이었을 때 세 토막이 되면 안 된다", () => {
  const samples = [
    { kind: "afterConflict", date: "2026-09-17", resolved: true },
    { kind: "afterConflict", date: "2026-09-17", resolved: false },
    { kind: "quiet", speech: true, latency: true },
    { kind: "meetingRequest", requestedOn: "2026-09-17", daysWaiting: 1, urgent: false },
  ];
  for (const t of samples) assert.ok(!reasonOf(t).includes(" · "), `${t.kind}: ${reasonOf(t)}`);
});

test("reason 은 두 개까지만 잇는다", () => {
  const line = renderBriefingLine([
    { kind: "drop", from: "green", to: "red" },
    { kind: "quiet", speech: true, latency: false },
    { kind: "noPeerMention", weeks: 3 },
  ]);
  assert.equal(line.reason.split(" · ").length, 2);
  assert.equal(line.status, "초록 → 빨강");
});
