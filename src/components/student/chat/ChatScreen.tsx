// 담당: 이유민
// AI 와 이야기하는 화면 — 등·하교 3단계.
//
// 앞 화면(홈·마음)과 통일하기 위해 지킨 것:
//   - 같은 스테이지(16:10) 위, 컨테이너 쿼리 단위로만 크기를 잡는다
//   - 상단 로고·프로필은 홈 컴포넌트를 그대로 재사용
//   - 배경은 마음 화면과 같은 밝은 그라데이션
//   - 진행 표시는 공용 점 5개 (목업의 2/2 알약 대신)
//   - 메신저 타임스탬프는 넣지 않는다
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SalpimHeader from "../home/SalpimHeader";
import StudentProfile from "../home/StudentProfile";
import type { ChatBubble as Bubble } from "../useCheckinFlow";
import type { Reply } from "../mockScenarios";
import ChatBubble from "./ChatBubble";
import GuideChips from "./GuideChips";
import TalkButton from "./TalkButton";
import { studentPhotoPath } from "@/lib/students/photo";
import { useVoiceRecorder, type RecordingResult } from "./useVoiceRecorder";

/** AI 가 물어본 뒤 이만큼 조용하면 가이드 칩을 올린다 */
const HESITATION_MS = 3500;

export default function ChatScreen({
  active,
  badgeLabel,
  messages,
  typing,
  replies,
  replies2,
  consultState,
  onReply,
  onReply2,
  onRequestConsult,
  onEndConversation,
  onSpoken,
  thinking = false,
  voiceError = null,
  sessionNote = null,
  live = false,
  studentFullName = "김민준",
  studentPhotoSrc,
}: {
  active: boolean;
  badgeLabel: string;
  messages: Bubble[];
  typing: boolean;
  replies: Reply[] | null;
  replies2: { text: string; next2: string }[] | null;
  consultState: "hidden" | "choice" | "sending" | "sent" | "failed";
  onReply: (reply: Reply) => void;
  onReply2: (r: { text: string; next2: string }) => void;
  onRequestConsult: () => void;
  /** "오늘 대화 끝내기" — 면담 없이 아이템 화면으로 */
  onEndConversation?: () => void;
  /** 녹음이 끝났다. true 를 돌려주면 실제 대화로 처리된 것이고, false 면 칩으로 되돌린다 */
  onSpoken?: (audio: Blob, prosody: RecordingResult["prosody"]) => Promise<boolean>;
  /** 전사·응답을 기다리는 중 */
  thinking?: boolean;
  /** 전사에 실패했을 때 아이에게 보여줄 한 줄 */
  voiceError?: string | null;
  /** 대화가 기록되지 않는 이유 (예: 오늘 이 시간대는 이미 완료) */
  sessionNote?: string | null;
  /** 실제 대화(로그인 + API)가 가능한 상태인가 */
  live?: boolean;
  studentFullName?: string;
  /** 아이 말풍선 옆 프로필. 없으면 이름 첫 글자를 쓴다 */
  studentPhotoSrc?: string;
}) {
  // 사진을 명시하지 않으면 이름으로 찾는다. 없으면 화면이 이름 글자로 대신한다.
  const photo = studentPhotoSrc ?? studentPhotoPath(studentFullName);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showGuide, setShowGuide] = useState(false);
  /** 질문이 화면에 뜬 시각. 녹음 훅이 응답 지연을 재는 기준이 된다 */
  const promptShownAtRef = useRef<number | null>(null);

  const hasOptions = Boolean(replies?.length || replies2?.length);

  // 말할 수 있는 때 = 아이 차례일 때.
  //
  // 예전에는 칩(hasOptions)이 있을 때만 버튼을 열었는데, 그건 목업 시절 조건이다.
  // 실제 대화에서는 후속 질문에 칩이 붙지 않으므로 2턴째에 버튼이 죽어 있었다.
  // 기준은 "말할 차례인가" 하나다.
  const waitingForAnswer = messages.some((m) => m.pending) || typing || thinking;
  const ended = consultState !== "hidden";
  const canTalk = !ended && !waitingForAnswer && messages.length > 0;

  const getPromptShownAt = useCallback(() => promptShownAtRef.current, []);

  // 녹음이 끝났다. 로그인 세션이 있으면 전사→응답으로 이어지고,
  // 없으면(데모) 칩을 펼쳐 기존 목업 흐름으로 되돌린다.
  //
  // ⚠️ 오디오는 onSpoken 안에서 전사 요청으로 한 번 쓰이고 끝이다.
  //    state·DB 어디에도 넣지 않는다 (기획안 §8.1).
  const handleRecorded = useCallback(
    (result: RecordingResult) => {
      if (!onSpoken) {
        setShowGuide(true);
        return;
      }
      void onSpoken(result.audio, result.prosody).then((handled) => {
        if (!handled) setShowGuide(true);
      });
    },
    [onSpoken],
  );

  const recorder = useVoiceRecorder({ getPromptShownAt, onResult: handleRecorded });

  // 답할 차례가 오면 잠시 기다렸다가 가이드를 올린다.
  // 아이가 먼저 말하면(선택지가 사라지면) 가이드도 같이 내려간다.
  //
  // setState 는 전부 타이머·정리 함수 안에서만 부른다.
  // 이펙트 본문에서 동기로 부르면 연쇄 렌더가 난다.
  useEffect(() => {
    if (!hasOptions || ended) return;
    promptShownAtRef.current = Date.now();
    const show = window.setTimeout(() => setShowGuide(true), HESITATION_MS);
    return () => {
      window.clearTimeout(show);
      setShowGuide(false);
    };
  }, [hasOptions, ended, replies, replies2]);

  // 새 말풍선이 생기면 아래로 따라간다
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing, showGuide]);


  return (
    <section className={`chat-screen${active ? " active" : ""}`} aria-label="AI 와 이야기하기">
      <SalpimHeader />
      <StudentProfile name={studentFullName} photoSrc={photo} />

      {/* 색이 아니라 마음의 '말'을 남긴다. 뱃지 색은 고르는 색과 무관하게 한 가지로 통일 —
          색까지 따라 바뀌면 이미 고른 색을 한 번 더 평가받는 느낌이 든다. */}
      {badgeLabel && <div className="chat-color-badge">{badgeLabel}</div>}

      <div className="chat-scroll" ref={scrollRef}>
        {messages.map((m, i) => (
          <ChatBubble
            key={m.id}
            bubble={m}
            // 연속된 같은 화자 중 첫 줄에만 아바타를 보인다. 양쪽 모두.
            showAvatar={messages[i - 1]?.type !== m.type}
            studentName={studentFullName}
            studentPhotoSrc={photo}
          />
        ))}

        {typing && !messages.some((m) => m.pending) && (
          <div className="chat-row chat-row--ai">
            <span className="chat-avatar chat-avatar--empty" aria-hidden="true" />
            <div className="chat-typing" aria-label="살핌이 입력 중">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {/* 대화가 끝나면 아이가 직접 고른다. 자동으로 넘어가지 않는다 —
            "선생님과 이야기하고 싶다"는 선택지가 지나가 버리면 안 된다. */}
        {consultState !== "hidden" && (
          <div className="chat-row chat-row--ai">
            <span className="chat-avatar chat-avatar--empty" aria-hidden="true" />
            {consultState === "sent" || consultState === "failed" ? (
              <span
                className={`chat-consult chat-consult--done${consultState === "failed" ? " chat-consult--failed" : ""}`}
              >
                {consultState === "sent"
                  ? "선생님께 전했어 ✓"
                  : "지금은 전하지 못했어. 선생님께 직접 말해줄래?"}
              </span>
            ) : (
              <div className="chat-ending">
                <button
                  type="button"
                  className="chat-consult"
                  onClick={onRequestConsult}
                  disabled={consultState === "sending"}
                >
                  {consultState === "sending" ? "전하는 중…" : "선생님이랑 이야기하고 싶어"}
                </button>
                <button
                  type="button"
                  className="chat-end"
                  onClick={onEndConversation}
                  disabled={consultState === "sending"}
                >
                  오늘 대화 끝내기
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="chat-bottom">
        {voiceError && <p className="chat-voice-error">{voiceError}</p>}
        {!voiceError && sessionNote && <p className="chat-session-note">{sessionNote}</p>}
        {showGuide && hasOptions && !ended && (
          <GuideChips
            replies={replies}
            replies2={replies2}
            // 음성이 실제로 동작하는 상황에서는 고를 수 없다. 아이가 직접 말해야
            // 그 발화에서 감정을 읽을 수 있다.
            selectable={!live || recorder.status === "denied"}
            onReply={onReply}
            onReply2={onReply2}
          />
        )}
        <TalkButton
          status={recorder.status}
          elapsedMs={recorder.elapsedMs}
          level={recorder.level}
          askIfDone={recorder.askIfDone}
          onStart={recorder.start}
          onStop={recorder.stop}
          onFallback={() => setShowGuide(true)}
          disabled={!canTalk}
        />
      </div>
    </section>
  );
}
