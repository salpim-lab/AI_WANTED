type HoldClock = { now: () => number; every: (tick: () => void) => () => void };
const holdClock: HoldClock = {
  now: () => performance.now(),
  every: tick => {
    const timer = setInterval(tick, 16);
    return () => clearInterval(timer);
  },
};

/** Keep ticking until the held pointer is released, even if the scene stops scheduling frames. */
export function createHeldWalk(clock: HoldClock = holdClock) {
  let move: (key: string, pressed: boolean, seconds?: number) => void = () => {};
  let held: { key: string; pointerId: number } | null = null;
  let stopLoop: (() => void) | null = null;
  const release = () => {
    stopLoop?.();
    stopLoop = null;
    if (!held) return;
    const key = held.key;
    held = null;
    move(key, false);
  };
  return {
    press(key: string, pointerId: number) {
      release();
      held = { key, pointerId };
      move(key, true);
      let previous = clock.now();
      stopLoop = clock.every(() => {
        if (!held) return;
        const now = clock.now();
        const seconds = Math.min(Math.max((now - previous) / 1000, 0), 0.05);
        previous = now;
        move(held.key, true, seconds);
      });
    },
    release,
    listen(target: EventTarget, visibility: EventTarget & { readonly hidden: boolean }, onMove: (key: string, pressed: boolean, seconds?: number) => void) {
      move = onMove;
      const end = (event: Event) => {
        if ((event as PointerEvent).pointerId === held?.pointerId) release();
      };
      const hide = () => { if (visibility.hidden) release(); };
      target.addEventListener("pointerup", end);
      target.addEventListener("pointercancel", end);
      target.addEventListener("blur", release);
      visibility.addEventListener("visibilitychange", hide);
      return () => {
        release();
        move = () => {};
        target.removeEventListener("pointerup", end);
        target.removeEventListener("pointercancel", end);
        target.removeEventListener("blur", release);
        visibility.removeEventListener("visibilitychange", hide);
      };
    },
  };
}
