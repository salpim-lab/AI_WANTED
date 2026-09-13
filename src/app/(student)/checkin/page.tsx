// 담당: 이유민
// 등교 흐름 (5단계): 교사 코멘트 확인 → 색 선택 → AI 꼬리질문(녹음) → 아이템 생성 → 섬 배치
// 참고: docs/planning/PLANNING.md "[학생 화면] — 등교 흐름"
//
// 이 page는 조립만 담당한다. 실제 단계별 UI/로직은 components/student/* 조각을 사용.
// 5단계(섬 배치)는 components/student/IslandBoard.tsx — 강윤지 담당, 여기서는 호출만.

"use client";

import { useCheckinFlow } from "@/components/student/useCheckinFlow";
import { getCheckinScenario } from "@/components/student/mockScenarios";
import TeacherComment from "@/components/student/TeacherComment";
import ColorPicker from "@/components/student/ColorPicker";
import ChatPanel from "@/components/student/ChatPanel";
import ItemReveal from "@/components/student/ItemReveal";
import IslandBoard from "@/components/student/IslandBoard";

export default function CheckinPage() {
  const flow = useCheckinFlow("checkin");
  const scenario = flow.color ? getCheckinScenario(flow.color) : null;

  return (
    <>
      <div className="progress-dots">
        {[1, 2, 3, 4, 5].map((s) => (
          <span
            key={s}
            className={s === flow.step ? "active" : s < flow.step ? "done" : undefined}
          />
        ))}
      </div>

      <TeacherComment active={flow.step === 1} onNext={() => flow.goTo(2)} />
      <ColorPicker active={flow.step === 2} onSelect={flow.selectColor} />
      <ChatPanel
        active={flow.step === 3}
        badgeLabel={scenario?.badgeLabel ?? ""}
        badgeStyle={scenario?.badgeStyle ?? { background: "#eef2ff", color: "#4338ca" }}
        messages={flow.messages}
        typing={flow.typing}
        replies={flow.replies}
        replies2={flow.replies2}
        consultState={flow.consultState}
        onReply={(r) => scenario && flow.handleReply(r, scenario.followups)}
        onReply2={(r) => scenario && flow.handleReply2(r, scenario.followups)}
        onRequestConsult={flow.requestConsult}
      />
      <ItemReveal active={flow.step === 4} item={flow.item} onNext={() => flow.goTo(5)} />
      <IslandBoard active={flow.step === 5} item={flow.item} onComplete={() => {}} />
    </>
  );
}
