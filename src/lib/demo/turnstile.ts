// 사람 확인(Cloudflare Turnstile) 공용 코드 — demo-init 화면과 홈(/)이 같이 쓴다. 브라우저에서만 부른다.
//
// 첫 진입이 느린 이유: 새 방문자는 [스크립트 내려받기 → 사람 확인 → 익명 가입 → init]을 순서대로 기다린다(실측 3~7초).
// 그중 사람 확인을 홈에서 미리 끝내 두면(prewarmTurnstile) 방문자가 카드를 누를 때는 토큰이 이미 있어서
// demo-init이 위젯을 기다리지 않고 바로 가입한다(takePrewarmedToken).
//
// 안전 원칙
// - 미리 하는 것은 "토큰 받기"뿐이다. 익명 가입(계정 생성)은 demo-init에서 방문자가 진입할 때만 한다 —
//   구경만 하는 방문자가 계정을 만들면 낭비이고 악용 여지가 된다.
// - 토큰은 한 번만 쓸 수 있고 300초 뒤 만료된다. 꺼내면 바로 지우고, 오래된 것은 쓰지 않는다.
// - 미리 받기가 실패하거나 사용자 조작을 요구하면 조용히 포기한다. 그때는 demo-init이 예전처럼 위젯을 띄운다.

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
export const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      appearance?: "always" | "execute" | "interaction-only";
    },
  ) => string;
  remove: (widgetId: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function loadTurnstile(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing"))));
    script.addEventListener("error", () => reject(new Error("turnstile script failed")));
    if (!existing) {
      script.src = TURNSTILE_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

const STORAGE_KEY = "salpim.turnstile";
/** Cloudflare 토큰은 발급 뒤 300초 유효하다. 가입 요청이 오가는 시간까지 여유를 두고 200초까지만 쓴다. */
export const PREWARM_MAX_AGE_MS = 200_000;
/** 사람 확인이 사용자 조작을 요구해 끝나지 않으면 이 시간 뒤 포기한다(보이지 않는 위젯은 조작할 수 없다). */
const PREWARM_GIVE_UP_MS = 30_000;

export type StoredToken = { token: string; at: number };

/** 저장된 토큰이 아직 쓸 만한가 — 순수 함수(테스트용). */
export function isFreshToken(entry: StoredToken | null, now: number, maxAgeMs = PREWARM_MAX_AGE_MS): entry is StoredToken {
  if (!entry || typeof entry.token !== "string" || entry.token.length === 0) return false;
  const age = now - entry.at;
  return age >= 0 && age <= maxAgeMs;
}

function readStored(): StoredToken | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredToken>;
    return typeof value.token === "string" && typeof value.at === "number" ? { token: value.token, at: value.at } : null;
  } catch {
    return null; // 저장소를 못 쓰는 환경(시크릿 모드 등)은 미리 받은 토큰이 없는 것으로 본다
  }
}

function writeStored(entry: StoredToken): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // 저장 못 하면 미리 받은 효과만 없고 흐름은 그대로다
  }
}

function clearStored(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 무시
  }
}

/** 미리 받아 둔 토큰을 꺼낸다. 한 번 꺼내면 지운다(토큰은 한 번만 쓸 수 있다). 없거나 오래됐으면 null. */
export function takePrewarmedToken(now: number = Date.now()): string | null {
  const entry = readStored();
  clearStored();
  return isFreshToken(entry, now) ? entry.token : null;
}

let prewarming = false;

/**
 * 홈에서 부른다 — 방문자가 카드를 누르기 전에 사람 확인을 뒤에서 끝내 토큰만 받아 둔다. 익명 가입은 하지 않는다.
 * 이미 쓸 만한 토큰이 있거나 진행 중이면 아무것도 하지 않는다. 어떤 실패도 화면에 드러내지 않는다.
 */
export async function prewarmTurnstile(): Promise<void> {
  if (typeof window === "undefined" || !TURNSTILE_SITE_KEY || prewarming) return;
  if (isFreshToken(readStored(), Date.now())) return;
  prewarming = true;

  const startedAt = Date.now();
  let widgetId: string | null = null;
  let box: HTMLDivElement | null = null;
  let giveUp: number | null = null;
  const cleanup = () => {
    if (giveUp !== null) window.clearTimeout(giveUp);
    try {
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    } catch {
      // 이미 지워졌으면 무시
    }
    box?.remove();
    prewarming = false;
  };

  try {
    const turnstile = await loadTurnstile();
    box = document.createElement("div");
    box.setAttribute("aria-hidden", "true");
    // 화면 안에 두되 보이지 않게 한다(투명 + 클릭 불가). display:none이나 화면 밖(left:-10000px)에 두면
    // 확인이 시작되지 않거나 멈출 수 있어서 실측에서 미리 받은 토큰이 만들어지지 않았다.
    box.style.cssText = "position:fixed;right:0;bottom:0;width:300px;height:65px;opacity:0;pointer-events:none;z-index:-1;";
    document.body.appendChild(box);
    giveUp = window.setTimeout(() => {
      console.info("[turnstile] 미리 받기 포기(30초 안에 끝나지 않음 — 사용자 조작이 필요한 확인일 수 있음)");
      cleanup();
    }, PREWARM_GIVE_UP_MS);
    console.info("[turnstile] 미리 받기 시작");
    widgetId = turnstile.render(box, {
      sitekey: TURNSTILE_SITE_KEY,
      appearance: "interaction-only",
      callback: (token) => {
        writeStored({ token, at: Date.now() });
        console.info(`[turnstile] 미리 받기 완료 (${Date.now() - startedAt}ms)`);
        cleanup();
      },
      "error-callback": () => {
        console.info(`[turnstile] 미리 받기 실패 (${Date.now() - startedAt}ms)`);
        cleanup();
      },
      "expired-callback": cleanup,
    });
  } catch (e) {
    console.info("[turnstile] 미리 받기 오류", e instanceof Error ? e.message : e);
    cleanup();
  }
}
