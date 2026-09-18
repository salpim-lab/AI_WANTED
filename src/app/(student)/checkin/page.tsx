// 담당: 이유민
// 등교 흐름 (5단계): 홈(선생님 편지) → 색 선택 → AI 꼬리질문(녹음) → 아이템 생성 → 섬 배치
// 참고: docs/planning/PLANNING.md "[학생 화면] — 등교 흐름"
//
// 이 page는 조립만 담당한다. 실제 단계별 UI/로직은 components/student/* 조각을 사용.
// 5단계(섬 배치)는 components/student/IslandBoard.tsx — 강윤지 담당, 여기서는 호출만.

"use client";

import "@/styles/prototype-student-chat.css";
import { useCheckinFlow } from "@/components/student/useCheckinFlow";
import { getCheckinScenario } from "@/components/student/mockScenarios";
import { SIGNAL_COLORS } from "@/lib/constants/colors";
import StudentHome from "@/components/student/home/StudentHome";
import MoodPicker from "@/components/student/mood/MoodPicker";
import ChatScreen from "@/components/student/chat/ChatScreen";
import ItemReveal from "@/components/student/ItemReveal";
import IslandBoard from "@/components/student/IslandBoard";

export default function CheckinPage() {
  const flow = useCheckinFlow("checkin");
  const scenario = flow.color ? getCheckinScenario(flow.color) : null;
  // 뱃지는 색 이름이 아니라 마음 설명을 보여준다. 아이가 "내가 왜 이 기분이지?" 를
  // 떠올리며 말하도록 돕는 장치다. 하교 화면과 같은 출처(SIGNAL_COLORS)를 쓴다.
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
        mode="morning"
        active={flow.step === 1}
        onNext={() => flow.goTo(2)}
        bgSrc="/brand/checkin_home2.webp"
      />
      <MoodPicker active={flow.step === 2} onSelect={flow.selectColor} />
      <ChatScreen
        active={flow.step === 3}
        badgeLabel={colorMeta ? colorMeta.label : ""}
        messages={flow.messages}
        typing={flow.typing}
        replies={flow.replies}
        replies2={flow.replies2}
        consultState={flow.consultState}
        onReply={(r) => scenario && flow.handleReply(r, scenario.followups)}
        onReply2={(r) => scenario && flow.handleReply2(r, scenario.followups)}
        onRequestConsult={flow.requestConsult}
        onSpoken={flow.handleSpoken}
        thinking={flow.thinking}
        voiceError={flow.voiceError}
      />
      <ItemReveal active={flow.step === 4} item={flow.item} onNext={() => flow.goTo(5)} />
      <IslandBoard active={flow.step === 5} item={flow.item} onComplete={() => {}} />
    </>
  );
}
