// 담당: 진승혜 (탭 네비게이션) / 이지현 (TeacherAgentWidget)
// 역할: 4개 탭(대시보드/아이 상세/학생관찰일지/학부모상담기록) 공통 레이아웃
//
// 중요: TeacherAgentWidget은 반드시 이 layout에서만 마운트할 것.
// App Router 특성상 layout은 탭(하위 page) 이동 시 리마운트되지 않으므로,
// 위젯의 대화 상태가 탭을 넘나들어도 유지된다 (전역 상태관리 불필요).
// 각 탭 page.tsx 안에는 위젯을 절대 넣지 말 것 — 중복 마운트/충돌 방지.

import TeacherAgentWidget from "@/components/teacher/agent/TeacherAgentWidget";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* TODO(진승혜): 탭 네비게이션 (대시보드/아이 상세/학생관찰일지/학부모상담기록) */}
      <main>{children}</main>
      <TeacherAgentWidget />
    </div>
  );
}
