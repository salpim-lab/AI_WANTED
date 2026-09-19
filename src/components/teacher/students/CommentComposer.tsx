// 담당: 김현우
// 아이 상세 하단 "내일 전달할 코멘트".
//   초안: POST /api/ai/comment-draft { studentId, date } → 200 { draft: string | null, sent: string | null }
//         501(키 미설정·테스트 대상 아님)이면 서버가 넘겨준 mock 초안(fallbackDraft)을 그대로 쓴다 — 따로 "예시" 표시는 하지 않는다.
//   초안은 입력창 안에 회색 글씨(고스트 텍스트)로 깔린다. 교사가 Tab을 누르면 남은 초안이 그대로 입력되고,
//   초안과 같은 글자로 쓰기 시작하면 이어지는 부분만 회색으로 남는다. 다른 말을 쓰기 시작하면 사라진다.
//   보내기: Server Action(sendTeacherCommentAction) → feedback_drafts.final_text, status='sent'.
//         아이는 다음 날 등교 홈 "선생님 편지"로 본다. 그날 이미 보낸 게 있으면(sent) 그 글과 "전달 예정" 상태로 연다.
// 가드레일(기획안 10장 AI 대필 금지): 초안은 제안일 뿐 자동으로 입력·저장·발송하지 않는다.
//   교사가 Tab으로 받아들이거나 직접 쓰고, 저장을 눌러야만 전달된다.

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { sendTeacherCommentAction } from "@/app/(teacher)/students/actions";
import { salpimMuted, salpimPaperCard, salpimTitle } from "@/components/shared/ui";

const MAX_COMMENT_LENGTH = 500;

// 입력창과 회색 초안(고스트)이 정확히 겹쳐야 해서 글꼴·여백·테두리 두께를 한 곳에서 같이 쓴다.
// 글꼴은 아이가 받는 편지 본문과 같은 손글씨(Gaegu, 학생 화면 .sh-letter-body) — 쓰는 동안 받을 모습을 미리 본다.
const letterField =
  "w-full resize-none rounded-2xl border-[1.5px] px-4 py-3 font-[family-name:var(--font-hand)] text-[18px] leading-[1.7] outline-none";

type DraftState =
  | { status: "loading" }
  | { status: "ready"; draft: string }
  | { status: "unavailable" };

export default function CommentComposer({
  studentId,
  studentName,
  date,
  fallbackDraft,
}: {
  studentId: string;
  studentName: string;
  date: string;
  fallbackDraft: string | null;
}) {
  const [draftState, setDraftState] = useState<DraftState>({ status: "loading" });
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const ghostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/ai/comment-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, date }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data: { draft?: string | null; sent?: string | null } = await response.json().catch(() => ({}));
        // 그날 이미 보낸 글이 있으면 그 글을 입력창에 두고 "전달 예정" 상태로 연다
        if (data.sent) {
          setText(data.sent);
          setSaved(true);
        }
        if (response.status === 501) {
          setDraftState(fallbackDraft ? { status: "ready", draft: fallbackDraft } : { status: "unavailable" });
          return;
        }
        if (!response.ok) throw new Error(`comment-draft HTTP ${response.status}`);
        setDraftState(data.draft ? { status: "ready", draft: data.draft } : { status: "unavailable" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[CommentComposer]", error);
        setDraftState({ status: "unavailable" });
      });

    return () => controller.abort();
  }, [studentId, date, fallbackDraft]);

  // 초안과 같은 글자로 쓰고 있는 동안만 이어지는 부분을 회색으로 보여준다
  const draft = draftState.status === "ready" ? draftState.draft : "";
  const ghost = draft && draft.startsWith(text) ? draft.slice(text.length) : "";

  function acceptGhost() {
    setText(draft);
    setSaved(false);
  }

  function send() {
    setSendError(null);
    startSending(async () => {
      const result = await sendTeacherCommentAction({ studentId, date, text });
      if (result.status === "success") setSaved(true);
      else setSendError(result.message);
    });
  }

  return (
    <section className={`${salpimPaperCard} px-6 py-5`}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className={`${salpimTitle} flex items-center gap-1.5 text-xl`}>
          <span aria-hidden>✉️</span>
          선생님의 한마디
        </h3>
        <p className={`text-xs ${salpimMuted}`}>
          선생님의 말로 다듬어 저장하면, 내일 등교 때 {studentName}에게 전달돼요.
        </p>
      </div>

      <p id="teacher-comment-hint" className={`mb-2 flex flex-wrap items-center gap-1.5 text-[11px] ${salpimMuted}`}>
        {draftState.status === "loading" && "AI 초안을 불러오는 중…"}
        {draftState.status === "unavailable" && "AI 초안이 없어요. 직접 작성할 수 있어요."}
        {draftState.status === "ready" &&
          (ghost ? (
            <>
              회색 글씨는 AI 초안이에요.
              <kbd className="rounded border border-[#ece0c9] bg-white px-1 font-mono text-[10px] text-[#102a56]">Tab</kbd>
              을 누르면 그대로 쓸 수 있어요.
            </>
          ) : (
            "AI 초안을 참고해 선생님의 말로 쓰고 있어요."
          ))}
      </p>

      <label htmlFor="teacher-comment" className="sr-only">
        {studentName}에게 전달할 코멘트
      </label>
      <div className="relative">
        {/* 고스트 텍스트 — 입력창과 같은 글꼴·여백으로 겹쳐 그린다. 입력한 부분은 투명, 이어질 초안만 회색 */}
        <div
          ref={ghostRef}
          aria-hidden
          className={`${letterField} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words border-transparent`}
        >
          <span className="text-transparent">{text}</span>
          <span className="text-[#b8b1a0]">{ghost}</span>
        </div>
        <textarea
          id="teacher-comment"
          rows={4}
          value={text}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder={draftState.status === "ready" ? "" : "코멘트를 적어주세요…"}
          aria-describedby="teacher-comment-hint"
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          onKeyDown={(e) => {
            // Tab: 회색 초안이 보일 때만 받아들인다. 없으면 기본 동작(다음 칸으로 이동)을 막지 않는다.
            if (e.key === "Tab" && !e.shiftKey && ghost) {
              e.preventDefault();
              acceptGhost();
            }
          }}
          onScroll={(e) => {
            if (ghostRef.current) ghostRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          className={`${letterField} relative border-[#ece0c9] bg-transparent text-[#33405f] transition-colors focus:border-[#8b83ff]`}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ borderRadius: 999 }}
          disabled={draftState.status !== "ready" || text === ""}
          onClick={() => {
            // 입력을 비우면 회색 초안이 다시 보인다
            setText("");
            setSaved(false);
          }}
        >
          초안 다시 보기
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={saved || sending || !text.trim()}
          // 공용 .btn은 Tailwind로 덮어쓸 수 없어 학생 화면 보라색 둥근 버튼은 inline style로 준다
          style={{ borderRadius: 999, background: saved ? "#22c55e" : "#635bff", borderColor: "transparent" }}
          onClick={send}
        >
          {saved ? `✓ ${studentName}에게 전달 예정` : sending ? "보내는 중…" : "저장 - 내일 전달"}
        </button>
      </div>
      {sendError && (
        <p role="alert" className="mt-2 text-[11px] text-red-600">
          {sendError}
        </p>
      )}
    </section>
  );
}
