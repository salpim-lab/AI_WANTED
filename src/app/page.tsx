// 임시 랜딩. 실제로는 로그인/역할 분기(학생 태블릿 vs 교사)로 대체될 예정.
// 지금은 개발 중 화면 확인용 링크만 제공.

import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">살핌</h1>
      <div className="flex gap-4">
        <Link href="/checkin" className="underline">
          학생 화면 (등교)
        </Link>
        <Link href="/checkout" className="underline">
          학생 화면 (하교)
        </Link>
        <Link href="/dashboard" className="underline">
          교사 화면
        </Link>
      </div>
    </main>
  );
}
