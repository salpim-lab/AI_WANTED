import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { interopDefault: false, fsCache: false });
const { createHeldWalk } = await jiti.import("../heldWalk.ts");
function fixture() {
  const target = new EventTarget();
  const visibility = Object.assign(new EventTarget(), { hidden: false });
  const held = new Set();
  const walk = createHeldWalk();
  const dispose = walk.listen(target, visibility, (key, pressed) => pressed ? held.add(key) : held.delete(key));
  const send = (type, pointerId) => target.dispatchEvent(Object.assign(new Event(type), { pointerId }));
  return { target, visibility, held, walk, dispose, send };
}
test("a direction stays held across capture loss and another finger's release", () => {
  const f = fixture();
  f.walk.press("ArrowRight", 1);
  f.send("lostpointercapture", 1);
  f.send("pointerup", 2);
  assert.deepEqual([...f.held], ["ArrowRight"]);
  f.send("pointerup", 1);
  assert.equal(f.held.size, 0);
  f.dispose();
});
test("release outside the original button and pointer cancellation stop the held direction", () => {
  for (const type of ["pointerup", "pointercancel"]) {
    const f = fixture();
    f.walk.press("ArrowUp", 1);
    f.send(type, 1);
    assert.equal(f.held.size, 0);
    f.dispose();
  }
});
test("changing direction, window blur, hiding the page and unmounting cannot leave movement stuck", () => {
  const f = fixture();
  f.walk.press("ArrowUp", 1);
  f.walk.press("ArrowDown", 2);
  assert.deepEqual([...f.held], ["ArrowDown"]);
  f.send("pointerup", 1);
  assert.deepEqual([...f.held], ["ArrowDown"]);
  f.target.dispatchEvent(new Event("blur"));
  assert.equal(f.held.size, 0);
  f.walk.press("ArrowLeft", 3);
  f.visibility.hidden = true;
  f.visibility.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.held.size, 0);
  f.walk.press("ArrowRight", 4);
  f.dispose();
  assert.equal(f.held.size, 0);
});

test("holding advances continuously without extra pointer events, and release cancels the loop", () => {
  let tick;
  let now = 0;
  let cancelled = false;
  const pulses = [];
  const target = new EventTarget();
  const visibility = Object.assign(new EventTarget(), { hidden: false });
  const walk = createHeldWalk({
    now: () => now,
    every: callback => { tick = callback; return () => { cancelled = true; }; },
  });
  const dispose = walk.listen(target, visibility, (...args) => pulses.push(args));
  walk.press("ArrowRight", 7);
  assert.equal(typeof tick, "function", "pointerdown arms a continuous movement loop");
  for (let frame = 1; frame <= 120; frame++) { now = frame * 16; tick(); }
  assert.equal(pulses.filter(([, pressed]) => pressed).length, 121);
  assert.ok(pulses.slice(1).every(([key, pressed, seconds]) => key === "ArrowRight" && pressed && seconds === 0.016));
  target.dispatchEvent(Object.assign(new Event("pointerup"), { pointerId: 7 }));
  assert.equal(cancelled, true);
  const count = pulses.length;
  now += 16;
  tick();
  assert.equal(pulses.length, count, "no movement after release");
  dispose();
});
