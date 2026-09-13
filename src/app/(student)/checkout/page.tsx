// 담당: 이유민
// 하교 흐름 (3단계): 색 선택 → AI 고정 질문(녹음) → 아이템 생성 + 섬 배치
// 참고: docs/planning/PLANNING.md "[학생 화면] — 하교 흐름"
// ColorPicker/ChatPanel/ItemReveal은 checkin과 동일 컴포넌트 재사용 (교사 코멘트 단계만 없음)

"use client";

import { useCheckinFlow } from "@/components/student/useCheckinFlow";
import { CHECKOUT_SCENARIO } from "@/components/student/mockScenarios";
import { SIGNAL_COLORS } from "@/lib/constants/colors";
import ColorPicker from "@/components/student/ColorPicker";
import ChatPanel from "@/components/student/ChatPanel";
import ItemReveal from "@/components/student/ItemReveal";
import IslandBoard from "@/components/student/IslandBoard";

export default function CheckoutPage() {
  const flow = useCheckinFlow("checkout");
  const colorMeta = flow.color ? SIGNAL_COLORS[flow.color] : null;

  return (
    <>
      <div className="progress-dots">
        {[2, 3, 4, 5].map((s) => (
          <span
            key={s}
            className={s === flow.step ? "active" : s < flow.step ? "done" : undefined}
          />
        ))}
      </div>

      <ColorPicker active={flow.step === 2} onSelect={flow.selectColor} />
      <ChatPanel
        active={flow.step === 3}
        badgeLabel={colorMeta ? colorMeta.label : ""}
        badgeStyle={{ background: "#eef2ff", color: "#4338ca" }}
        messages={flow.messages}
        typing={flow.typing}
        replies={flow.replies}
        replies2={flow.replies2}
        consultState={flow.consultState}
        onReply={(r) => flow.handleReply(r, CHECKOUT_SCENARIO.followups)}
        onReply2={(r) => flow.handleReply2(r, CHECKOUT_SCENARIO.followups)}
        onRequestConsult={flow.requestConsult}
      />
      <ItemReveal active={flow.step === 4} item={flow.item} onNext={() => flow.goTo(5)} />
      <IslandBoard active={flow.step === 5} item={flow.item} onComplete={() => {}} />
    </>
  );
}
