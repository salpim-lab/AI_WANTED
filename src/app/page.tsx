// 홈 화면 — 로그인 없이 "학생 등교" / "학생 하교" / "선생님 화면" 중 골라 들어간다.
// (2026-09-19) 원래 임시 링크 목록이었던 걸 실제 진입 화면으로 교체.
// 로그인 방식 자체(익명 인증 등)는 아직 팀 논의 중 — 이 화면은 그 결정과 무관하게
// 지금 있는 라우트(/checkin, /checkout, /dashboard)로만 이동한다. 나중에 로그인이
// 붙어도 "역할을 고르는 진입점"이라는 이 화면의 역할 자체는 바뀔 필요가 없다.
//
// 처음엔 "학생 화면" 한 카드가 시간대로 등교/하교를 자동으로 골라주고, 그 밑에 심사·테스트용으로
// 등교/하교 바로가기를 따로 뒀는데, 시간대에 따라 그 둘이 똑같은 곳으로 가서 중복이었다.
// 세 개를 동등한 선택지로 바로 두는 쪽이 더 명확하다는 피드백으로 단순화.

import Link from "next/link";

const OPTIONS = [
  { href: "/checkin", emoji: "🌞", label: "학생 등교" },
  { href: "/checkout", emoji: "🌆", label: "학생 하교" },
  { href: "/dashboard", emoji: "🧑‍🏫", label: "선생님 화면" },
] as const;

export default function Home() {
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

      <div className="flex w-full max-w-2xl flex-col gap-4 sm:flex-row">
        {OPTIONS.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            className="flex flex-1 flex-col items-center gap-3 rounded-3xl bg-white p-8 shadow-lg shadow-indigo-500/10 ring-1 ring-black/5 transition-transform hover:-translate-y-1 hover:shadow-xl active:translate-y-0"
          >
            <span className="text-5xl">{o.emoji}</span>
            <span
              className="text-lg font-bold text-gray-900"
              style={{ fontFamily: "var(--font-cute), var(--font-sans-kr)" }}
            >
              {o.label}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
