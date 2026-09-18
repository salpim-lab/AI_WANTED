// 담당: 없음(공용 조립 파일) — 이 파일 자체는 거의 고칠 일이 없어야 정상.
// 탭 네비 내용은 components/teacher/TabNav.tsx(진승혜), 챗봇 내용은
// components/teacher/agent/TeacherAgentWidget.tsx(이지현)에서 각자 고칠 것.
// 이 layout.tsx는 두 컴포넌트를 "배치"만 하므로 두 사람이 동시에 건드릴 일이 없다.
//
// 중요: TeacherAgentWidget은 반드시 이 layout에서만 마운트할 것.
// App Router 특성상 layout은 탭(하위 page) 이동 시 리마운트되지 않으므로,
// 위젯의 대화 상태가 탭을 넘나들어도 유지된다 (전역 상태관리 불필요).
// 각 탭 page.tsx 안에는 위젯을 절대 넣지 말 것 — 중복 마운트/충돌 방지.

// 이 파일은 헤더/탭바만 그리는 공용 뼈대라 CSS도 "공용 디자인 토큰" 파일만 import한다.
// 화면별 스타일(대시보드/아이상세/게시판)은 각자 담당 페이지에서 알아서 import — 여기 추가하지 말 것.
import "@/styles/prototype-teacher-shared.css";
// 헤더·왼쪽 메뉴의 색만 덮는다 (학생 화면 톤). 껍데기는 탭 넷이 공유하므로 여기서 한 번만 건다.
import "@/styles/teacher-shell-tone.css";
import TabNav from "@/components/teacher/TabNav";
import CurrentDate from "@/components/teacher/CurrentDate";
import TeacherAgentWidget from "@/components/teacher/agent/TeacherAgentWidget";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="teacher-app">
      <div className="app">
        <header className="app-header">
          <div className="logo">
            살<span>핌</span>
          </div>
          <div className="meta">
            <strong>3학년 2반</strong> · <CurrentDate /> · 이선생님
          </div>
        </header>
        {/* 네비(왼쪽 사이드바) + 본문을 가로로 묶는 래퍼.
            .app-body 의 스타일은 TabNav 가 import 하는
            styles/prototype-teacher-sidebar.css(진승혜)에 있다. */}
        <div className="app-body">
          <TabNav />
          <main className="main">{children}</main>
        </div>
      </div>
      <TeacherAgentWidget />
    </div>
  );
}
