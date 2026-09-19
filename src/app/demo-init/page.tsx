// 담당: 이지현 (신규)
// 공개 데모 공통 초기화 화면. proxy.ts가 세션 없는 방문자를 여기로 보낸다(?next=원래 가려던 경로).
// 여기서 /api/demo/init 요청 "하나"만 완료한 뒤에 원래 경로로 돌아간다 — 학생·교사 화면
// 각자가 알아서 초기화를 시도하면 동시에 여러 익명 계정이 생길 수 있어서, 진입점을 하나로 모은다.
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function DemoInitBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setStatus("loading");
      try {
        const res = await fetch("/api/demo/init", { method: "POST" });
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const next = searchParams.get("next") || "/checkin";
        router.replace(next);
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid min-h-screen place-items-center bg-gray-50 px-4 text-center">
      {status === "loading" ? (
        <p className="text-sm text-gray-500">체험 준비 중이에요...</p>
      ) : (
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
