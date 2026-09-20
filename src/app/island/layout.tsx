import { notFound } from "next/navigation";

// 개발용 화면 — 프로덕션 빌드(Vercel Preview·Production)에서는 404. 로컬 `next dev`에서만 열린다.
export default function DevOnlyLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
