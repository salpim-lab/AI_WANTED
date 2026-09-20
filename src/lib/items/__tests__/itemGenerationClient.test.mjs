// 아이템 생성 폴링 회귀 테스트 — Vercel Preview에서 GET이 1초마다 (canceled)되어 결과를 영영 못 받던 문제(2026-09-20)를 막는다.
//   실행: npm run test:item-polling   (가짜 fetch만 쓴다. 네트워크·DB·AI 호출 없음)
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: false, fsCache: false, alias: { "@": fileURLToPath(new URL("../../../", import.meta.url)) } });
const { pollItemGeneration, waitForItemGeneration, fetchItemGenerationJob, ItemQueryTimeoutError, ITEM_QUERY_POLL_INTERVAL_MS, ITEM_QUERY_REQUEST_TIMEOUT_MS } = await jiti.import("../itemGenerationClient.ts");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (job) => new Response(JSON.stringify({ job }), { status: 200 });
const notReady = { id: "j", status: "generating", generated_asset_id: null, fallback_asset_id: null, student_item_id: null };
const ready = { id: "j", status: "completed", generated_asset_id: "a", fallback_asset_id: null, student_item_id: "i", asset: { name: "피자", asset_format: "procedural", geometry_spec: { parts: [] } } };

/** 가짜 fetch: 호출 시각·동시 실행 수·취소 여부를 기록하고, handler가 응답 시점을 정한다. */
function installFetch(handler) {
  const log = { starts: [], ends: [], inflight: 0, maxInflight: 0, aborted: 0 };
  const original = globalThis.fetch;
  globalThis.fetch = (url, init = {}) => {
    const index = log.starts.push(Date.now()) - 1;
    log.inflight++; log.maxInflight = Math.max(log.maxInflight, log.inflight);
    const signal = init.signal;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => { if (settled) return; settled = true; log.inflight--; log.ends[index] = Date.now(); fn(value); };
      signal?.addEventListener("abort", () => { log.aborted++; finish(reject, signal.reason ?? new DOMException("aborted", "AbortError")); }, { once: true });
      Promise.resolve(handler(index, signal)).then((response) => finish(resolve, response), (error) => finish(reject, error));
    });
  };
  return { log, restore: () => { globalThis.fetch = original; } };
}

test("응답이 1초보다 늦어도 진행 중인 GET을 취소하지 않고 결과를 받는다(기존 버그 재현 조건)", async () => {
  const { log, restore } = installFetch(async () => { await sleep(1_300); return json(ready); });
  try {
    const started = Date.now();
    const job = await pollItemGeneration("s", {}); // 기본값: 폴링 간격 1s, 요청 타임아웃 12s
    assert.equal(job.student_item_id, "i");
    assert.equal(log.aborted, 0, "느린 응답을 폴링 주기 때문에 취소하면 안 된다");
    assert.equal(log.starts.length, 1, "한 번의 요청으로 끝나야 한다");
    assert.ok(Date.now() - started >= 1_250);
  } finally { restore(); }
});

test("ready:false 응답 뒤에는 그 응답이 끝난 다음 폴링 간격만큼 기다렸다가 다음 요청을 보낸다", async () => {
  const { log, restore } = installFetch(async (index) => { await sleep(20); return json(index < 2 ? notReady : ready); });
  try {
    const seen = [];
    const job = await pollItemGeneration("s", { pollIntervalMs: 120, onJob: (j) => seen.push(j?.status) });
    assert.equal(job.student_item_id, "i");
    assert.equal(log.starts.length, 3);
    for (let i = 1; i < log.starts.length; i++) {
      const gap = log.starts[i] - log.ends[i - 1];
      assert.ok(gap >= 110, `이전 응답 종료 → 다음 요청 시작 간격 ${gap}ms(≥120ms 기대)`);
    }
    assert.deepEqual(seen, ["generating", "generating", "completed"], "응답마다 onJob이 호출된다(중간 상태 표시용)");
    assert.equal(log.aborted, 0);
  } finally { restore(); }
});

test("여러 GET이 동시에 실행되지 않는다(항상 한 번에 하나)", async () => {
  const { log, restore } = installFetch(async (index) => { await sleep(45); return json(index < 5 ? notReady : ready); });
  try {
    await pollItemGeneration("s", { pollIntervalMs: 10 });
    assert.equal(log.starts.length, 6);
    assert.equal(log.maxInflight, 1, "동시에 진행 중인 요청이 2개 이상이면 안 된다");
  } finally { restore(); }
});

test("바깥 signal(언마운트)로 abort하면 진행 중인 요청과 대기를 즉시 끝내고, 이후 새 요청을 보내지 않는다", async () => {
  // (a) 요청 진행 중 abort
  {
    const { log, restore } = installFetch(() => new Promise(() => {})); // 끝나지 않는 요청
    try {
      const controller = new AbortController();
      const running = pollItemGeneration("s", { signal: controller.signal });
      await sleep(30);
      controller.abort();
      assert.equal(await running, null);
      assert.equal(log.aborted, 1, "진행 중인 요청이 바깥 signal로 중단된다");
      await sleep(80);
      assert.equal(log.starts.length, 1, "abort 뒤 새 요청 없음");
    } finally { restore(); }
  }
  // (b) 폴링 간격 대기 중 abort
  {
    const { log, restore } = installFetch(async () => json(notReady));
    try {
      const controller = new AbortController();
      const running = pollItemGeneration("s", { signal: controller.signal, pollIntervalMs: 5_000 });
      await sleep(40);
      const before = Date.now();
      controller.abort();
      assert.equal(await running, null);
      assert.ok(Date.now() - before < 200, "5초 대기를 기다리지 않고 즉시 끝난다");
      assert.equal(log.starts.length, 1);
    } finally { restore(); }
  }
  // (c) 이미 abort된 signal
  {
    const { log, restore } = installFetch(async () => json(ready));
    try {
      const controller = new AbortController(); controller.abort();
      assert.equal(await pollItemGeneration("s", { signal: controller.signal }), null);
      assert.equal(log.starts.length, 0);
    } finally { restore(); }
  }
});

test("네트워크 오류는 백오프 뒤 재시도한다(즉시 폭주 없음). 연속 오류가 한도에 이르면 오류를 던진다", async () => {
  {
    const { log, restore } = installFetch(async (index) => { if (index < 2) throw new TypeError("network down"); return json(ready); });
    try {
      const job = await pollItemGeneration("s", { errorBackoffMs: [60, 120], pollIntervalMs: 10 });
      assert.equal(job.student_item_id, "i");
      assert.equal(log.starts.length, 3);
      assert.ok(log.starts[1] - log.ends[0] >= 50, "첫 오류 뒤 ≥60ms 대기");
      assert.ok(log.starts[2] - log.ends[1] >= 110, "두 번째 오류 뒤 ≥120ms 대기(백오프 증가)");
    } finally { restore(); }
  }
  {
    const { log, restore } = installFetch(async () => new Response("{}", { status: 502 }));
    try {
      await assert.rejects(pollItemGeneration("s", { errorBackoffMs: [15], maxConsecutiveErrors: 3 }), /ITEM_GENERATION_QUERY_FAILED:502/);
      assert.equal(log.starts.length, 3, "연속 3회 실패 뒤 멈춘다");
    } finally { restore(); }
  }
});

test("요청 타임아웃은 폴링 간격과 별개다: 응답이 없으면 타임아웃으로 그 요청만 끊고 재시도한다", async () => {
  const { log, restore } = installFetch((index) => (index === 0 ? new Promise(() => {}) : Promise.resolve(json(ready))));
  try {
    const job = await pollItemGeneration("s", { requestTimeoutMs: 60, errorBackoffMs: [20], pollIntervalMs: 10 });
    assert.equal(job.student_item_id, "i");
    assert.equal(log.starts.length, 2);
    assert.equal(log.aborted, 1, "타임아웃으로 끊긴 것은 응답 없는 첫 요청 하나뿐");
    assert.ok(log.ends[0] - log.starts[0] >= 55, "타임아웃 이전에는 끊지 않는다");
  } finally { restore(); }
});

test("fetchItemGenerationJob: 타임아웃은 ItemQueryTimeoutError, 바깥 abort는 signal.reason", async () => {
  {
    const { restore } = installFetch(() => new Promise(() => {}));
    try { await assert.rejects(fetchItemGenerationJob("s", { requestTimeoutMs: 30 }), (error) => error instanceof ItemQueryTimeoutError); } finally { restore(); }
  }
  {
    const { restore } = installFetch(() => new Promise(() => {}));
    try {
      const controller = new AbortController();
      const pending = fetchItemGenerationJob("s", { signal: controller.signal, requestTimeoutMs: 5_000 });
      controller.abort(new Error("unmounted"));
      await assert.rejects(pending, /unmounted/);
    } finally { restore(); }
  }
});

test("waitForItemGeneration(호환 API): 창(timeoutMs)이 끝나도 진행 중인 요청은 끊지 않는다", async () => {
  const { log, restore } = installFetch(async () => { await sleep(120); return json(ready); });
  try {
    const result = await waitForItemGeneration("s", "placement", { timeoutMs: 20 });
    assert.equal(result.ready, true, "창(20ms)보다 늦은 응답(120ms)도 받는다");
    assert.equal(log.aborted, 0);
  } finally { restore(); }
  const slow = installFetch(async () => { await sleep(10); return json(notReady); });
  try {
    const result = await waitForItemGeneration("s", "placement", { timeoutMs: 15 });
    assert.equal(result.ready, false);
    assert.equal(slow.log.starts.length, 1, "창 안에 다음 폴링을 시작할 여유가 없으면 첫 응답으로 끝");
  } finally { slow.restore(); }
});

test("기본 상수: 요청 타임아웃(12s)은 폴링 간격(1s)과 분리돼 있다", () => {
  assert.equal(ITEM_QUERY_POLL_INTERVAL_MS, 1_000);
  assert.ok(ITEM_QUERY_REQUEST_TIMEOUT_MS >= 10_000 && ITEM_QUERY_REQUEST_TIMEOUT_MS <= 15_000);
});
