// 홈 화면 — 로그인 없이 "학생 화면" / "선생님 화면" 중 골라 들어간다.
// (2026-09-19) 원래 임시 링크 목록이었던 걸 실제 진입 화면으로 교체.
// 로그인 방식 자체(익명 인증 등)는 아직 팀 논의 중 — 이 화면은 그 결정과 무관하게
// 지금 있는 라우트(/checkin, /checkout, /dashboard)로만 이동한다. 나중에 로그인이
// 붙어도 "역할을 고르는 진입점"이라는 이 화면의 역할 자체는 바뀔 필요가 없다.
//
// 학생 카드는 시간대로 등교/하교를 자동으로 골라준다(정오 기준) — 실제 아이가 쓸 때는
// 매번 등교/하교를 스스로 고르게 하는 게 부자연스럽기 때문. 다만 심사·테스트 중에는
// 시간과 무관하게 양쪽을 다 봐야 해서, 카드 아래 작은 링크로 둘 다 바로 가는 길을 남겨둔다.

"use client";

import { useRouter } from "next/navigation";

function isMorning() {
  return new Date().getHours() < 12;
}

export default function Home() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-gradient-to-b from-indigo-50 via-white to-white px-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1
          className="text-4xl font-bold text-indigo-600"
          style={{ fontFamily: "var(--font-cute), var(--font-sans-kr)" }}
        >
          살핌
        </h1>
        <p className="text-sm text-gray-500">오늘도, 너의 마음을 들어요</p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-4 sm:flex-row">
        <button
          onClick={() => router.push(isMorning() ? "/checkin" : "/checkout")}
          className="flex flex-1 flex-col items-center gap-3 rounded-3xl bg-white p-8 shadow-lg shadow-indigo-500/10 ring-1 ring-black/5 transition-transform hover:-translate-y-1 hover:shadow-xl active:translate-y-0"
        >
          <span className="text-5xl">🎒</span>
          <span
            className="text-lg font-bold text-gray-900"
            style={{ fontFamily: "var(--font-cute), var(--font-sans-kr)" }}
          >
            학생 화면
          </span>
          <span className="text-xs text-gray-400">{isMorning() ? "등교 체크인으로 이동" : "하교 체크인으로 이동"}</span>
        </button>

        <button
          onClick={() => router.push("/dashboard")}
          className="flex flex-1 flex-col items-center gap-3 rounded-3xl bg-white p-8 shadow-lg shadow-indigo-500/10 ring-1 ring-black/5 transition-transform hover:-translate-y-1 hover:shadow-xl active:translate-y-0"
        >
          <span className="text-5xl">🧑‍🏫</span>
          <span
            className="text-lg font-bold text-gray-900"
            style={{ fontFamily: "var(--font-cute), var(--font-sans-kr)" }}
          >
            선생님 화면
          </span>
          <span className="text-xs text-gray-400">대시보드로 이동</span>
        </button>
      </div>

      {/* 심사·테스트용 — 시간대와 무관하게 학생 화면 양쪽을 바로 확인하고 싶을 때 */}
      <div className="flex gap-4 text-xs text-gray-400">
        <button onClick={() => router.push("/checkin")} className="underline-offset-2 hover:text-gray-600 hover:underline">
          등교 화면 바로 보기
        </button>
        <button onClick={() => router.push("/checkout")} className="underline-offset-2 hover:text-gray-600 hover:underline">
          하교 화면 바로 보기
        </button>
      </div>
    </main>
  );
}
