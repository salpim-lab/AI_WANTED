// 담당: 없음(공용 조립 파일) — 이 파일 자체는 거의 고칠 일이 없어야 정상.
// 탭 네비 내용은 components/teacher/TabNav.tsx(진승혜), 챗봇 내용은
// components/teacher/agent/TeacherAgentWidget.tsx(이지현)에서 각자 고칠 것.
// 이 layout.tsx는 두 컴포넌트를 "배치"만 하므로 두 사람이 동시에 건드릴 일이 없다.
//
// 중요: TeacherAgentWidget은 반드시 이 layout에서만 마운트할 것.
// App Router 특성상 layout은 탭(하위 page) 이동 시 리마운트되지 않으므로,
// 위젯의 대화 상태가 탭을 넘나들어도 유지된다 (전역 상태관리 불필요).
// 각 탭 page.tsx 안에는 위젯을 절대 넣지 말 것 — 중복 마운트/충돌 방지.

import TabNav from "@/components/teacher/TabNav";
import TeacherAgentWidget from "@/components/teacher/agent/TeacherAgentWidget";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <TabNav />
      <main>{children}</main>
      <TeacherAgentWidget />
    </div>
  );
}
