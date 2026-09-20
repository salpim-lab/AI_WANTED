// 미리 받은 사람 확인 토큰의 신선도·1회용 규칙 — 브라우저 없이 확인할 수 있는 부분만.
// 실행: node --test src/lib/demo/__tests__/turnstile.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import { PREWARM_MAX_AGE_MS, isFreshToken, takePrewarmedToken } from "../turnstile.ts";

const NOW = 1_000_000;

test("방금 받은 토큰은 쓸 수 있다", () => {
  assert.equal(isFreshToken({ token: "t", at: NOW }, NOW), true);
  assert.equal(isFreshToken({ token: "t", at: NOW - 1000 }, NOW), true);
});

test("한도(200초) 안이면 쓰고, 넘으면 쓰지 않는다 — Cloudflare 토큰은 300초 뒤 만료된다", () => {
  assert.equal(PREWARM_MAX_AGE_MS, 200_000);
  assert.equal(isFreshToken({ token: "t", at: NOW - PREWARM_MAX_AGE_MS }, NOW), true);
  assert.equal(isFreshToken({ token: "t", at: NOW - PREWARM_MAX_AGE_MS - 1 }, NOW), false);
});

test("없거나 비어 있거나 미래 시각인 토큰은 쓰지 않는다", () => {
  assert.equal(isFreshToken(null, NOW), false);
  assert.equal(isFreshToken({ token: "", at: NOW }, NOW), false);
  assert.equal(isFreshToken({ token: "t", at: NOW + 5000 }, NOW), false);
});

test("브라우저 저장소가 없는 환경에서는 미리 받은 토큰이 없는 것으로 본다(오류를 던지지 않는다)", () => {
  // Node에는 window가 없다 — 저장소 접근이 실패해도 null이어야 흐름이 예전 방식으로 이어진다.
  assert.equal(takePrewarmedToken(NOW), null);
});

test("꺼낸 토큰은 한 번만 쓸 수 있다(저장소에서 지운다)", () => {
  const store = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
  };
  try {
    store.set("salpim.turnstile", JSON.stringify({ token: "abc", at: NOW }));
    assert.equal(takePrewarmedToken(NOW), "abc");
    assert.equal(takePrewarmedToken(NOW), null, "두 번째 호출은 이미 지워져 null");
    store.set("salpim.turnstile", JSON.stringify({ token: "old", at: NOW - PREWARM_MAX_AGE_MS - 1 }));
    assert.equal(takePrewarmedToken(NOW), null, "오래된 토큰은 꺼내도 쓰지 않는다");
    assert.equal(store.has("salpim.turnstile"), false, "오래된 토큰도 지워진다");
    store.set("salpim.turnstile", "깨진 값{");
    assert.equal(takePrewarmedToken(NOW), null, "깨진 값은 null");
  } finally {
    delete globalThis.window;
  }
});
