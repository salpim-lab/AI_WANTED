// 담당: 이유민
// 등교 흐름 (5단계): 홈(선생님 편지) → 색 선택 → AI 꼬리질문(녹음) → 아이템 생성 → 섬 배치
// 참고: docs/planning/PLANNING.md "[학생 화면] — 등교 흐름"
//
// 이 page는 조립만 담당한다. 실제 단계별 UI/로직은 components/student/* 조각을 사용.
// 5단계(섬 배치)는 components/student/IslandBoard.tsx — 강윤지 담당, 여기서는 호출만.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "@/styles/prototype-student-chat.css";
import { useCallback } from "react";
import { useCheckinFlow } from "@/components/student/useCheckinFlow";
import { useStepUrl } from "@/components/student/useStepUrl";
import { getCheckinScenario } from "@/components/student/mockScenarios";
import { SIGNAL_COLORS } from "@/lib/constants/colors";
import StudentHome from "@/components/student/home/StudentHome";
import StudentBackButton from "@/components/student/home/StudentBackButton";
import MoodPicker from "@/components/student/mood/MoodPicker";
import ChatScreen from "@/components/student/chat/ChatScreen";
import ItemPreparation from "@/components/student/ItemPreparation";
import { ITEM_CATALOG } from "@/lib/items/itemCatalog";
import type { Item } from "@/components/student/mockScenarios";

export default function CheckinPage() {
  const flow = useCheckinFlow("checkin");
  const { setItem, goTo } = flow;
  const enterIsland = useCallback((item: Item) => { setItem(item); goTo(5); }, [setItem, goTo]);

  // 단계마다 주소를 준다(/checkin, /checkin/mood, /talk, /item, /island). 화면의 뒤로가기와
  // 브라우저 뒤로가기가 같은 기록을 쓰게 해서 둘 다 바로 앞 단계로 간다.
  // 대화·아이템·섬은 앞 단계의 데이터가 있어야 보여줄 수 있다 — 없으면(새로고침 등) 홈으로.
  const canShowStep = useCallback(
    (s: number) =>
      s <= 2 ||
      (s === 3 ? flow.messages.length > 0 : s === 4 ? Boolean(flow.sessionId || flow.item) : Boolean(flow.item)),
    [flow.messages.length, flow.sessionId, flow.item],
  );
  const { back } = useStepUrl({ base: "/checkin", step: flow.step, goTo, canShow: canShowStep });
  // 섬 화면 테스트용 — 대화·아이템 준비를 건너뛰고 카탈로그 아이템 하나로 바로 섬에 들어간다.
  const [testItem, setTestItem] = useState<Item | null>(null);
  const enterTestIsland = () => {
    const pick = ITEM_CATALOG[Math.floor(Math.random() * ITEM_CATALOG.length)];
    setTestItem({ emoji: "🎁", name: pick.displayName, reason: "섬 화면 테스트용 아이템이야. ".repeat(3).trim(), geometrySpec: pick.spec });
  };

  // 섬 배치를 마치면 잠시 안내를 띄우고 하교 화면으로 넘긴다.
  // 공개 링크로 들어온 사람이 등교 → 섬 → 하교를 한 흐름으로 겪게 하려는 것이다(2026-09-19).
  const router = useRouter();
  const [toCheckout, setToCheckout] = useState(false);
  const checkoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goToCheckout = useCallback(() => {
    if (checkoutTimer.current !== null) return;
    setToCheckout(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    checkoutTimer.current = setTimeout(() => router.push("/checkout"), reducedMotion ? 0 : 2400);
  }, [router]);
  useEffect(() => () => {
    if (checkoutTimer.current !== null) clearTimeout(checkoutTimer.current);
  }, []);
  const scenario = flow.color ? getCheckinScenario(flow.color) : null;
  // 뱃지는 색 이름이 아니라 마음 설명을 보여준다. 아이가 "내가 왜 이 기분이지?" 를
  // 떠올리며 말하도록 돕는 장치다. 하교 화면과 같은 출처(SIGNAL_COLORS)를 쓴다.
  const colorMeta = flow.color ? SIGNAL_COLORS[flow.color] : null;

  // 선생님 편지 — undefined는 불러오는 중, null은 확인했지만 오늘 편지가 없는 상태다.
  // 둘을 구분해야 로딩 중 인사 문구가 잠깐 보였다가 편지로 바뀌는 깜빡임이 생기지 않는다.
  const [letter, setLetter] = useState<{ text: string; teacherName: string } | null | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/student/letter", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { letter: null }))
      .then((data: { letter?: { text: string; teacherName: string } | null }) => setLetter(data.letter ?? null))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // 편지는 없어도 등교 흐름은 이어진다
        setLetter(null);
      });
    return () => controller.abort();
  }, []);

  // 대기(아이템 준비) 화면을 먼저 보여 준 뒤 섬으로 넘어간다. sessionId가 없으면 시간만 흐르는 시연 모드다.
  if (testItem) return <ItemPreparation flow="checkin" sessionId={null} item={testItem} onReady={() => {}} onIslandComplete={goToCheckout} />;

  return (
    <>
      {flow.step === 1 && (
        <button type="button" onClick={enterTestIsland} style={{ position: "fixed", right: 16, bottom: 16, zIndex: 100, padding: "8px 14px", borderRadius: 999, border: "1px solid #ccc", background: "#fff", fontSize: 14 }}>
          섬 화면 테스트하기
        </button>
      )}
      <StudentHome
        mode="morning"
        active={flow.step === 1}
        onNext={() => flow.goTo(2)}
        bgSrc="/brand/checkin_home2.webp"
        {...(letter === undefined ? {} : { letterText: letter?.text ?? null })}
        {...(letter ? { teacherName: letter.teacherName } : {})}
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
        conversationOver={flow.conversationOver}
        onReply={(r) => scenario && flow.handleReply(r, scenario.followups)}
        onReply2={(r) => scenario && flow.handleReply2(r, scenario.followups)}
        onRequestConsult={flow.requestConsult}
        onEndConversation={flow.endConversation}
        onSpoken={flow.handleSpoken}
        thinking={flow.thinking}
        voiceError={flow.voiceError}
        sessionNote={flow.sessionNote}
        live={flow.live}
        flow="checkin"
        color={flow.color}
      />
      {(flow.step === 4 || flow.step === 5) && (
        <ItemPreparation
          flow="checkin"
          sessionId={flow.sessionId}
          item={flow.item}
          onReady={enterIsland}
          onIslandComplete={goToCheckout}
        />
      )}
      {toCheckout && (
        <div className="sh-to-checkout" role="status" aria-live="polite">
          <p className="sh-cute">오늘 아침 이야기 고마워!</p>
          <span>즐거운 하루 보내고, 하교 시간에 다시 만나자</span>
        </div>
      )}
      {(
        flow.step === 2 ||
        (flow.step === 5 && !toCheckout) ||
        (flow.step === 3 && !flow.typing && !flow.thinking && !flow.conversationOver && flow.consultState === "hidden")
      ) && (
        <StudentBackButton
          onBack={back}
        />
      )}
    </>
  );
}
