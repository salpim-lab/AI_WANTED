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
  chatTurn,
  finishSession,
  LiveChatError,
  requestMeeting,
  startSession,
  transcribe,
} from "@/lib/chat/liveChat";
import { syllablesPerSec, type UtteranceProsody } from "@/lib/chat/prosody";
import type { TranscriptMessage } from "@/lib/supabase/raw/wholeTranscript";
import {
  CHECKOUT_SCENARIO,
  getCheckinScenario,
  type ColorScenario,
  type Item,
  type Reply,
} from "./mockScenarios";

export type ChatBubble = {
  id: number;
  type: "ai" | "user" | "navy-msg";
  text: string;
  /** 전사를 기다리는 자리 말풍선 */
  pending?: boolean;
};

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

let bubbleId = 0;

/**
 * 마지막 인사가 뜨고 마무리 팝업이 올라오기까지 기다리는 시간.
 *
 * 인사와 동시에 팝업이 뜨면 아이가 인사를 읽기도 전에 화면이 덮인다.
 * 아이가 두 줄을 읽을 시간을 준다.
 */
const CLOSING_PAUSE_MS = 2200;

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
  // choice = 마무리 인사 뒤 두 버튼, sending = 신청 중, sent = 신청 완료
  // choice = 두 버튼, sending = 신청 중, sent = 전달됨, failed = 전달 못 함
  const [consultState, setConsultState] = useState<
    "hidden" | "choice" | "sending" | "sent" | "failed"
  >("hidden");

  // resetDemo 등에서 진행 중인 setTimeout 체인을 무시하기 위한 세대 카운터
  const genRef = useRef(0);

  // ── 실제 대화(로그인 + API) 경로 ────────────────────────────────
  // 로그인 없이 보는 데모에서는 sessionId 가 null 로 남고, 아래 경로는 전부 건너뛴다.
  // 그때 화면은 기존 목업 칩 흐름 그대로 동작한다.
  const sessionIdRef = useRef<string | null>(null);
  /** color state 는 setColor 직후 아직 낡아 있다. 게이트 요청에는 이 ref 를 쓴다 */
  const activeColorRef = useRef<SignalColor | null>(null);
  /** 위험 신호로 종료됐는가. 면담 신청의 우선순위를 올린다 */
  const riskRef = useRef(false);
  /** 전사에 실패했을 때 되돌려줄 칩. 색을 고를 때 채워둔다 */
  const pendingRepliesRef = useRef<Reply[] | null>(null);
  /** 서버로 보낼 대화 기록. 말풍선(messages)과 달리 speaker/입력방식을 담는다 */
  const transcriptRef = useRef<TranscriptMessage[]>([]);
  /** 발화별 파생 수치. index 는 저장 직전에 서버가 매긴다 */
  const prosodyRef = useRef<Omit<UtteranceProsody, "index">[]>([]);
  const [thinking, setThinking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  /** 세션을 못 만든 이유. 로그인 안 한 데모에서는 숨긴다 */
  const [sessionNote, setSessionNote] = useState<string | null>(null);
  /** 세션이 열렸는가. 화면이 "말해야 하는 상황"인지 판단하는 데 쓴다 */
  const [live, setLive] = useState(false);

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
        await wait(CLOSING_PAUSE_MS);
        if (!isCurrent()) return;
        setConsultState("choice");
        return;
      }

      if (scenario.replies.length > 0) {
        pendingRepliesRef.current = scenario.replies;
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
      setSessionNote(null);
      setLive(false);
      void startSession(flow, c).then((result) => {
        if (result.sessionId !== null) {
          sessionIdRef.current = result.sessionId;
          setLive(true);
          return;
        }
        sessionIdRef.current = null;
        setLive(false);
        // 목업으로 조용히 되돌아가면 무엇이 잘못됐는지 알 길이 없다.
        // 아이에게는 보여주지 않되, 개발 중에는 콘솔에 남긴다.
        console.warn(`[session] 대화를 기록하지 않습니다 — ${result.code}: ${result.reason}`);
        setSessionNote(result.code === "UNAUTHORIZED" ? null : result.reason);
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
        if (reply.next === "skip") setConsultState("choice");
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
        setConsultState("choice");
      }
      if (fu.replies2) {
        await wait(500);
        if (!isCurrent()) return;
        setReplies2(fu.replies2);
        return;
      }
      if (fu.done) {
        // 음성 경로와 같은 종료 화면·같은 템포를 쓴다. 아이가 직접 끝낸다.
        await wait(CLOSING_PAUSE_MS);
        if (!isCurrent()) return;
        setConsultState("choice");
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
      await wait(CLOSING_PAUSE_MS);
      if (!isCurrent()) return;
      setConsultState("choice");
    },
    [addBubble],
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

      // 말이 끝나자마자 아이 쪽에 자리를 잡아둔다.
      // 전사에 1초쯤 걸리는데, 그동안 화면에 아무 변화가 없으면
      // 아이는 버튼이 안 눌린 줄 알고 다시 누른다.
      const pendingId = bubbleId++;
      setMessages((prev) => [...prev, { id: pendingId, type: "user", text: "", pending: true }]);
      const dropPending = () => setMessages((prev) => prev.filter((m) => m.id !== pendingId));

      try {
        const text = await transcribe(sessionId, audio);
        if (!isCurrent()) return true;
        if (!text.trim()) {
          dropPending();
          setThinking(false);
          setVoiceError("잘 안 들렸어. 한 번만 더 말해줄래?");
          // 다시 말하기 어려우면 고를 수 있게 남겨둔다.
          setReplies(pendingRepliesRef.current);
          return true;
        }

        // 자리 말풍선을 실제 말로 바꾼다. 새로 추가하지 않는다.
        setMessages((prev) =>
          prev.map((m) => (m.id === pendingId ? { ...m, text, pending: false } : m)),
        );
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

        // 후속 질문이면 한 줄만 띄우고 다음 발화를 기다린다.
        if (result.action === "ask_followup") {
          if (result.reply) {
            addBubble("ai", result.reply);
            transcriptRef.current.push({
              speaker: "assistant",
              content: result.reply,
              input_method: "text",
            });
          }
          return true;
        }

        // 여기서부터 종료다. 인사 문구는 게이트가 정하므로 화면에 띄우기 전에 이미 알고 있다.
        // 그래서 저장을 먼저 걸고, 기다리지 않고 인사를 띄운다.
        // 저장(0.2초)과 인사(2초 남짓)가 겹치는 만큼 아이템 추론을 일찍 시작할 수 있다.
        const lines = result.lines?.length ? result.lines : result.reply ? [result.reply] : [];
        for (const line of lines) {
          transcriptRef.current.push({ speaker: "assistant", content: line, input_method: "text" });
        }
        const saving = finishSession({
          sessionId,
          transcript: transcriptRef.current,
          prosody: prosodyRef.current,
        }).catch((error) => console.error("[finish] 전문 저장 실패", error));

        for (const [i, line] of lines.entries()) {
          if (i > 0) {
            setTyping(true);
            await wait(900);
            if (!isCurrent()) return true;
          }
          addBubble("ai", line);
        }

        // 아이가 직접 끝낸다. 자동으로 넘어가지 않는다.
        // 위험 신호로 넘어온 경우에는 면담 쪽을 권하는 문구로 바뀐다.
        riskRef.current = result.risk === "flag" || result.action === "handoff_to_teacher";
        await wait(CLOSING_PAUSE_MS);
        if (!isCurrent()) return true;
        setConsultState("choice");
        void saving;
        return true;
      } catch (error) {
        if (!isCurrent()) return true;
        dropPending();
        setTyping(false);
        setThinking(false);
        // AI_ENABLED=false 로 꺼둔 상태는 고장이 아니다. 조용히 칩으로 되돌린다.
        // 말해도 전사되지 않으므로 칩을 고를 수 있게 바꾼다.
        if (error instanceof LiveChatError && error.isDisabled) {
          setLive(false);
          // 시작할 때 치워둔 칩을 되돌린다. 안 그러면 고를 것도 말할 것도 없이 멈춘다.
          setReplies(pendingRepliesRef.current);
          return false;
        }
        setVoiceError(
          error instanceof LiveChatError ? error.message : "지금은 듣기가 어려워. 아래에서 골라줄래?",
        );
        setReplies(pendingRepliesRef.current);
        return true;
      }
    },
    [addBubble, flow],
  );

  /** "선생님이랑 이야기하고 싶어" — 신청을 남기고 아이템 화면으로 넘어간다 */
  const requestConsult = useCallback(async () => {
    setConsultState("sending");
    const sessionId = sessionIdRef.current;
    let delivered = false;
    if (sessionId) {
      try {
        await requestMeeting(sessionId, riskRef.current ? "high" : "normal");
        delivered = true;
      } catch (error) {
        // 실패해도 아이를 붙잡아 두지는 않는다. 다만 전해졌다고 말하지도 않는다.
        // 도움을 청한 아이에게 "전했어"라고 하고 실제로 아무도 못 받는 것이
        // 이 화면에서 할 수 있는 가장 나쁜 일이다.
        // console.error 를 쓰지 않는 이유: 개발 화면에서 빨간 오류창이 아이 화면을 덮는다.
        console.warn("[meeting] 면담 신청 실패", error);
      }
    }
    setConsultState(delivered ? "sent" : "failed");
    await wait(900);
    goTo(4);
  }, [goTo]);

  /** "오늘 대화 끝내기" */
  const endConversation = useCallback(() => {
    setConsultState("hidden");
    goTo(4);
  }, [goTo]);

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
    riskRef.current = false;
    setThinking(false);
    setVoiceError(null);
    setSessionNote(null);
    setLive(false);
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
    sessionNote,
    live,
    isLive,
    handleSpoken,
    goTo,
    selectColor,
    handleReply,
    handleReply2,
    requestConsult,
    endConversation,
    reset,
  };
}

export type CheckinFlow = ReturnType<typeof useCheckinFlow>;
