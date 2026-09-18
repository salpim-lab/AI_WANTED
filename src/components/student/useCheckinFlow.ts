// 담당: 이유민
// 프로토타입 script의 goTo/selectColor/addBubble/showReplies/handleReply 등
// (getElementById 기반 DOM 조작) 로직을 React state로 새로 짠 것.
// CheckinPage/CheckoutPage가 이 훅으로 상태를 갖고, 각 화면 컴포넌트에는
// props로 필요한 조각만 내려준다.

"use client";

import { useCallback, useRef, useState } from "react";
import type { SignalColor } from "@/lib/types/signal";
import { pickOpener } from "@/lib/chat/openers";
import {
  CHECKOUT_SCENARIO,
  getCheckinScenario,
  type ColorScenario,
  type Item,
  type Reply,
} from "./mockScenarios";

export type ChatBubble = { id: number; type: "ai" | "user" | "navy-msg"; text: string };

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

let bubbleId = 0;

export function useCheckinFlow(flow: "checkin" | "checkout") {
  // ⚠️ checkin_sessions 행은 **색 선택(2단계)에서** 만들어야 한다. 1단계(홈)에서 만들면 안 된다.
  //    등교 홈의 선생님 편지는 "마지막 등교 세션 이후에 보낸 편지"만 띄우는 방식으로
  //    읽음 처리를 대신한다(읽음 컬럼 없이). 홈에서 세션을 만들면 자기 세션 때문에
  //    편지가 뜨자마자 사라진다. 자세한 내용: docs/planning/TEACHER_LETTER_LOGIC.md
  //
  // 등교·하교 모두 첫 화면(1단계)부터 시작한다. 하교 첫 화면은 선생님 편지 없이
  // 인사와 CTA만 보여준다. 2~5단계 번호는 runScenario/handleReply 안의
  // goTo(3)/goTo(4) 호출과 맞추기 위해 그대로 쓴다.
  // reset() 이 돌아갈 자리라서 상수로 남겨 둔다.
  const startStep = 1;
  const [step, setStep] = useState(startStep);
  const [color, setColor] = useState<SignalColor | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [typing, setTyping] = useState(false);
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [replies2, setReplies2] = useState<{ text: string; next2: string }[] | null>(null);
  const [consultState, setConsultState] = useState<"hidden" | "shown" | "sent">("hidden");

  // resetDemo 등에서 진행 중인 setTimeout 체인을 무시하기 위한 세대 카운터
  const genRef = useRef(0);

  const goTo = useCallback((next: number) => setStep(next), []);

  const addBubble = useCallback((type: ChatBubble["type"], text: string) => {
    setTyping(false);
    setMessages((prev) => [...prev, { id: bubbleId++, type, text }]);
  }, []);

  const runScenario = useCallback(
    async (scenario: ColorScenario, activeColor: SignalColor) => {
      const gen = ++genRef.current;
      const isCurrent = () => genRef.current === gen;

      setItem(scenario.item);
      setMessages([]);
      setReplies(null);
      setReplies2(null);
      setConsultState("hidden");
      goTo(3);

      // 첫 질문은 openers.ts 가 만든다 — 색 + 등하교 + 요일로 정해지는 고정 문장이다.
      // AI 를 부르지 않으므로 "색 3초" 예산을 지킨다. mockScenarios 의 문장은
      // 같은 내용이지만 요일 변주가 없어 여기서 덮어쓴다.
      const opener = pickOpener(flow, activeColor);
      const [first, ...rest] = scenario.messages;
      if (first) {
        await wait(first.delay);
        if (!isCurrent()) return;
        addBubble(first.isNavy ? "navy-msg" : "ai", opener);
      }
      for (const msg of rest) {
        await wait(msg.delay);
        if (!isCurrent()) return;
        addBubble(msg.isNavy ? "navy-msg" : "ai", msg.text);
      }

      if (scenario.autoEnd) {
        await wait(800);
        if (!isCurrent()) return;
        await wait(1200);
        if (!isCurrent()) return;
        goTo(4);
        return;
      }

      if (scenario.replies.length > 0) {
        await wait(400);
        if (!isCurrent()) return;
        setReplies(scenario.replies);
      }
    },
    [addBubble, goTo],
  );

  const selectColor = useCallback(
    (c: SignalColor) => {
      setColor(c);
      const scenario = flow === "checkin" ? getCheckinScenario(c) : CHECKOUT_SCENARIO;
      void runScenario(scenario, c);
    },
    [flow, runScenario],
  );

  const handleReply = useCallback(
    async (reply: Reply, followups: ColorScenario["followups"]) => {
      const gen = ++genRef.current;
      const isCurrent = () => genRef.current === gen;

      setReplies(null);
      addBubble("user", reply.text);

      const fu = followups[reply.next];
      if (!fu) {
        if (reply.next === "skip") goTo(4);
        return;
      }

      if (fu.ai) {
        await wait(reply.next === "skip" ? 400 : 500);
        if (!isCurrent()) return;
        setTyping(true);
        await wait(reply.next === "skip" ? 700 : 700);
        if (!isCurrent()) return;
        addBubble("ai", fu.ai);
      }
      if (fu.item) setItem(fu.item);
      if (fu.showConsult) {
        await wait(300);
        if (!isCurrent()) return;
        setConsultState("shown");
      }
      if (fu.replies2) {
        await wait(500);
        if (!isCurrent()) return;
        setReplies2(fu.replies2);
        return;
      }
      if (fu.done) {
        await wait(1400);
        if (!isCurrent()) return;
        goTo(4);
      }
    },
    [addBubble, goTo],
  );

  const handleReply2 = useCallback(
    async (r: { text: string; next2: string }, followups: ColorScenario["followups"]) => {
      const gen = ++genRef.current;
      const isCurrent = () => genRef.current === gen;

      setReplies2(null);
      addBubble("user", r.text);

      const fu = followups[r.next2];
      if (!fu) return;

      await wait(400);
      if (!isCurrent()) return;
      setTyping(true);
      await wait(700);
      if (!isCurrent()) return;
      if (fu.ai) addBubble("ai", fu.ai);
      if (fu.item) setItem(fu.item);
      await wait(1400);
      if (!isCurrent()) return;
      goTo(4);
    },
    [addBubble, goTo],
  );

  const requestConsult = useCallback(() => setConsultState("sent"), []);

  const reset = useCallback(() => {
    genRef.current++;
    setStep(startStep);
    setColor(null);
    setItem(null);
    setMessages([]);
    setTyping(false);
    setReplies(null);
    setReplies2(null);
    setConsultState("hidden");
  }, [startStep]);

  return {
    startStep,
    step,
    color,
    item,
    messages,
    typing,
    replies,
    replies2,
    consultState,
    goTo,
    selectColor,
    handleReply,
    handleReply2,
    requestConsult,
    reset,
  };
}

export type CheckinFlow = ReturnType<typeof useCheckinFlow>;
