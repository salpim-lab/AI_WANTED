// 담당: 이유민 (섬 제외 학생 화면 전체)
// 역할: 등교/하교 공통 레이아웃 — 디바이스 프레임 + 진행 단계 표시(progress-dots)
// 참고: docs/prototype/prototype-student.html 의 #progress-dots, .device-frame 마크업 이식 대상

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100">
      {/* TODO: 프로토타입의 progress-dots를 현재 단계(step) 기반 컴포넌트로 이식 */}
      {children}
    </div>
  );
}
