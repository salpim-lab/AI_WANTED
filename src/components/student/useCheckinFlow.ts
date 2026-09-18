// 담당: 이유민
// 프로토타입 script의 goTo/selectColor/addBubble/showReplies/handleReply 등
// (getElementById 기반 DOM 조작) 로직을 React state로 새로 짠 것.
// CheckinPage/CheckoutPage가 이 훅으로 상태를 갖고, 각 화면 컴포넌트에는
// props로 필요한 조각만 내려준다.

"use client";

import { useCallback, useRef, useState } from "react";
import type { SignalColor } from "@/lib/types/signal";
import { pickOpener } from "@/lib/chat/openers";
import { chatTurn, finishSession, LiveChatError, startSession, transcribe } from "@/lib/chat/liveChat";
import { syllablesPerSec, type UtteranceProsody } from "@/lib/chat/prosody";
import type { TranscriptMessage } from "@/lib/supabase/raw/wholeTranscript";
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

  // ── 실제 대화(로그인 + API) 경로 ────────────────────────────────
  // 로그인 없이 보는 데모에서는 sessionId 가 null 로 남고, 아래 경로는 전부 건너뛴다.
  // 그때 화면은 기존 목업 칩 흐름 그대로 동작한다.
  const sessionIdRef = useRef<string | null>(null);
  /** color state 는 setColor 직후 아직 낡아 있다. 게이트 요청에는 이 ref 를 쓴다 */
  const activeColorRef = useRef<SignalColor | null>(null);
  /** 서버로 보낼 대화 기록. 말풍선(messages)과 달리 speaker/입력방식을 담는다 */
  const transcriptRef = useRef<TranscriptMessage[]>([]);
  /** 발화별 파생 수치. index 는 저장 직전에 서버가 매긴다 */
  const prosodyRef = useRef<Omit<UtteranceProsody, "index">[]>([]);
  const [thinking, setThinking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const isLive = useCallback(() => sessionIdRef.current !== null, []);

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
        // 고정 질문도 기록에 남긴다. 나중에 아이 답만 보면 무엇에 대한 답인지 알 수 없다.
        transcriptRef.current.push({ speaker: "assistant", content: opener, input_method: "fixed" });
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

      // 세션 생성은 기다리지 않는다. 첫 질문은 고정 문장이라 서버가 필요 없고,
      // 기획안의 "색 3초" 예산이 네트워크에 묶이면 안 된다.
      sessionIdRef.current = null;
      activeColorRef.current = c;
      transcriptRef.current = [];
      prosodyRef.current = [];
      setVoiceError(null);
      void startSession(flow, c).then((id) => {
        sessionIdRef.current = id;
      });

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
      transcriptRef.current.push({ speaker: "student", content: reply.text, input_method: "text" });

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
      transcriptRef.current.push({ speaker: "student", content: r.text, input_method: "text" });

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

  /**
   * 아이가 말을 마쳤다. 전사 → 게이트 판단 → 다음 질문 또는 종료.
   *
   * 실패해도 대화를 끊지 않는다. 아이 입장에서 "내 말을 못 알아들었다"는 경험은
   * 남지만, 화면이 멈춰 버리면 그 세션 자체가 사라진다. 그래서 오류는 칩으로 되돌린다.
   */
  const handleSpoken = useCallback(
    async (audio: Blob, prosody: Omit<UtteranceProsody, "index">) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return false;

      const gen = ++genRef.current;
      const isCurrent = () => genRef.current === gen;

      setReplies(null);
      setReplies2(null);
      setVoiceError(null);
      setThinking(true);

      try {
        const text = await transcribe(sessionId, audio);
        if (!isCurrent()) return true;
        if (!text.trim()) {
          setThinking(false);
          setVoiceError("잘 안 들렸어. 한 번만 더 말해줄래?");
          return true;
        }

        addBubble("user", text);
        transcriptRef.current.push({ speaker: "student", content: text, input_method: "voice" });
        // 음절/초는 전사가 나와야 계산된다. 녹음 시점에는 글자 수를 모른다.
        prosodyRef.current.push({
          ...prosody,
          syllables_per_sec: syllablesPerSec(text, prosody.duration_sec),
        });

        setTyping(true);
        const result = await chatTurn({
          sessionId,
          flow,
          color: activeColorRef.current ?? "green",
          transcript: transcriptRef.current,
        });
        if (!isCurrent()) return true;

        setTyping(false);
        setThinking(false);
        if (result.reply) {
          addBubble("ai", result.reply);
          transcriptRef.current.push({
            speaker: "assistant",
            content: result.reply,
            input_method: "text",
          });
        }

        if (result.action === "ask_followup") return true;

        // 위험 신호면 면담 신청을 바로 띄운다. 캐묻지 않고 사람에게 넘긴다.
        if (result.action === "handoff_to_teacher") setConsultState("shown");

        await finishSession({
          sessionId,
          transcript: transcriptRef.current,
          prosody: prosodyRef.current,
        }).catch((error) => console.error("[finish] 전문 저장 실패", error));

        await wait(1400);
        if (!isCurrent()) return true;
        goTo(4);
        return true;
      } catch (error) {
        if (!isCurrent()) return true;
        setTyping(false);
        setThinking(false);
        setVoiceError(
          error instanceof LiveChatError ? error.message : "지금은 듣기가 어려워. 아래에서 골라줄래?",
        );
        return true;
      }
    },
    [addBubble, flow, goTo],
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
    sessionIdRef.current = null;
    activeColorRef.current = null;
    transcriptRef.current = [];
    prosodyRef.current = [];
    setThinking(false);
    setVoiceError(null);
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
    thinking,
    voiceError,
    isLive,
    handleSpoken,
    goTo,
    selectColor,
    handleReply,
    handleReply2,
    requestConsult,
    reset,
  };
}

export type CheckinFlow = ReturnType<typeof useCheckinFlow>;
