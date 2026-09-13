// 담당: 이유민
// 등교 흐름 (5단계): 교사 코멘트 확인 → 색 선택 → AI 꼬리질문(녹음) → 아이템 생성 → 섬 배치
// 참고: docs/planning/PLANNING.md "[학생 화면] — 등교 흐름"
//
// 이 page는 조립만 담당한다. 실제 단계별 UI/로직은 components/student/* 조각을 사용할 것.
// 5단계(섬 배치)는 components/student/IslandBoard.tsx — 강윤지 담당, 여기서는 호출만.

export default function CheckinPage() {
  return (
    <main>
      {/* TODO(이유민): 1~4단계 조립 */}
      {/* <TeacherComment /> <ColorPicker /> <ChatPanel /> <ItemReveal /> */}
      {/* TODO: 5단계는 <IslandBoard /> (강윤지) 로 이동/렌더 */}
    </main>
  );
}
