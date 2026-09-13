// 담당: 이유민 (섬 제외 학생 화면 전체)
// 역할: 등교/하교 공통 레이아웃 — 디벗(태블릿) 프레임 + 상태바.
// 진행 단계 표시(progress-dots)는 등교(5단계)/하교(3단계) 단계 수가 달라서
// 여기가 아니라 각 page.tsx(checkin/checkout)에서 그린다.
// 참고: docs/prototype/prototype-student.html

// 이 파일은 device-frame/tablet/status-bar만 그리는 공용 뼈대라 CSS도 "공용" 파일만 import한다.
// 화면별 스타일(s1~s4, s5)은 각자 담당 페이지/컴포넌트에서 알아서 import — 여기 추가하지 말 것.
import "@/styles/prototype-student-shared.css";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="device-frame">
      <div className="tablet">
        <div className="status-bar">
          <span className="time">오전 8:32</span>
          <span className="app-name">살핌</span>
          <span className="icons">
            <span>WiFi</span>
            <span>🔋 87%</span>
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
