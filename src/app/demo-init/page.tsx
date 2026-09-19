// 담당: 이지현 (신규)
// 공개 데모 공통 초기화 화면. proxy.ts가 세션 없는 방문자를 여기로 보낸다(?next=원래 가려던 경로).
//
// 익명 로그인(signInAnonymously)을 부르는 곳은 이 화면 하나다 — **브라우저에서** 부른다. 서버(/api/demo/init)에서
// 부르면 Supabase가 보는 요청 IP가 방문자가 아니라 Vercel 서버 IP라서, 익명 로그인 레이트리밋(IP 단위, 기본 시간당 30회)을
// 전체 방문자가 공유해 30명 넘으면 전부 실패한다. 캡차 토큰(Turnstile)도 브라우저에서만 얻을 수 있다.
// 서버(/api/demo/init)는 이미 만들어진 익명 세션에 프로필·담당 학급을 준비하는 일만 한다.
//
// 흐름: 세션 확인 → (없으면) [Turnstile 토큰] → signInAnonymously → POST /api/demo/init → 원래 경로.
// 학생·교사 화면 각자가 알아서 초기화하면 동시에 여러 익명 계정이 생길 수 있어서 진입점을 여기 하나로 모은다.
//
// 캡차: NEXT_PUBLIC_TURNSTILE_SITE_KEY가 있으면 위젯을 띄워 토큰을 받고, 없으면 토큰 없이 로그인한다(Supabase 캡차를
// 켜기 전 개발·검증용). Supabase 쪽 캡차를 켰는데 이 값이 없으면 로그인이 거절돼 오류 화면이 뜬다 — 배포 순서 주의:
// 사이트 키를 넣은 배포가 먼저, 그다음에 Supabase 캡차를 켠다(docs/데모_방문자_격리_적용_절차.md §10).
"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
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

/** ?next= 는 사이트 안 경로만 허용한다 — 임의 주소로 보내는 오픈 리다이렉트 방지. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/checkin";
  return raw;
}

function loadTurnstile(): Promise<TurnstileApi> {
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

type Status = "loading" | "challenge" | "error";

function DemoInitBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("loading");
  const widgetBox = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  // 세션 준비(서버) → 원래 경로. 익명 세션이 이미 있으면 로그인 단계는 건너뛴다.
  const finish = useCallback(async () => {
    const res = await fetch("/api/demo/init", { method: "POST" });
    if (!res.ok) throw new Error(`init ${res.status}`);
    router.replace(safeNext(searchParams.get("next")));
  }, [router, searchParams]);

  const signInThenFinish = useCallback(
    async (captchaToken?: string) => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined);
      if (error) throw error;
      await finish();
    },
    [finish],
  );

  useEffect(() => {
    // React StrictMode(개발)가 effect를 두 번 돌려도 로그인은 한 번만 — 계정이 두 개 생기면 안 된다.
    if (started.current) return;
    started.current = true;
    let widgetId: string | null = null;

    async function run() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) return await finish(); // 이미 세션이 있으면(익명 아니어도) 서버가 판단한다

        if (!TURNSTILE_SITE_KEY) return await signInThenFinish();

        const turnstile = await loadTurnstile();
        setStatus("challenge");
        if (!widgetBox.current) throw new Error("no widget box");
        widgetId = turnstile.render(widgetBox.current, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: "interaction-only", // 사람이 확실하면 위젯이 보이지 않는다
          callback: (token) => {
            setStatus("loading");
            signInThenFinish(token).catch((e) => {
              console.error("[demo-init]", e);
              setStatus("error");
            });
          },
          "error-callback": () => setStatus("error"),
          "expired-callback": () => setStatus("error"),
        });
      } catch (e) {
        console.error("[demo-init]", e);
        setStatus("error");
      }
    }

    run();
    return () => {
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [finish, signInThenFinish]);

  return (
    <div className="grid min-h-screen place-items-center bg-gray-50 px-4 text-center">
      {status === "error" ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-gray-600">준비하다가 문제가 생겼어요. 다시 시도해주세요.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-gray-500">
            {status === "challenge" ? "잠시만요, 사람이 맞는지 확인하고 있어요..." : "체험 준비 중이에요..."}
          </p>
          {/* Turnstile 위젯 자리 — 확인이 자동으로 끝나면 보이지 않는다 */}
          <div ref={widgetBox} />
        </div>
      )}
    </div>
  );
}

export default function DemoInitPage() {
  // useSearchParams()는 Suspense 경계 없이 쓰면 정적 프리렌더가 실패한다(Next.js 요구사항).
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-gray-50" />}>
      <DemoInitBody />
    </Suspense>
  );
}
