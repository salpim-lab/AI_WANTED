// 담당: 이유민
// 하교 흐름: 첫 화면 → 색 선택 → AI 고정 질문(녹음) → 아이템 생성 + 섬 배치
// 참고: docs/planning/PLANNING.md "[학생 화면] — 하교 흐름"
// StudentHome/MoodPicker/ChatScreen/ItemReveal은 checkin과 동일 컴포넌트 재사용.
// 첫 화면은 period="afternoon" 으로 문구가 바뀌고 선생님 편지는 나오지 않는다.

"use client";

import "@/styles/prototype-student-chat.css";
import { useCheckinFlow } from "@/components/student/useCheckinFlow";
import { CHECKOUT_SCENARIO } from "@/components/student/mockScenarios";
import { SIGNAL_COLORS } from "@/lib/constants/colors";
import StudentHome from "@/components/student/home/StudentHome";
import MoodPicker from "@/components/student/mood/MoodPicker";
import ChatScreen from "@/components/student/chat/ChatScreen";
import ItemReveal from "@/components/student/ItemReveal";
import IslandBoard from "@/components/student/IslandBoard";

export default function CheckoutPage() {
  const flow = useCheckinFlow("checkout");
  const colorMeta = flow.color ? SIGNAL_COLORS[flow.color] : null;

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

      <StudentHome
        mode="afternoon"
        active={flow.step === 1}
        onNext={() => flow.goTo(2)}
        bgSrc="/brand/checkout_home-배경만.webp"
      />
      <MoodPicker active={flow.step === 2} onSelect={flow.selectColor} />
      <ChatScreen
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
