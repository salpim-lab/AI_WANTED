// 담당: 김현우
// 아이 상세 하단 "내일 전달할 코멘트".
//   초안: POST /api/ai/comment-draft { studentId, date } → 200 { draft: string | null }
//         501(키 미설정·테스트 대상 아님)이면 서버가 넘겨준 mock 예시(fallbackDraft)를 "예시"로 쓴다.
//   초안은 입력창 안에 회색 글씨(고스트 텍스트)로 깔린다. 교사가 Tab을 누르면 남은 초안이 그대로 입력되고,
//   초안과 같은 글자로 쓰기 시작하면 이어지는 부분만 회색으로 남는다. 다른 말을 쓰기 시작하면 사라진다.
//   저장: 교사 최종본(feedback_drafts.final_text)을 저장하는 라우트가 아직 없다.
//         TODO(라우트 준비 후): 저장 버튼에서 그 라우트를 fetch. 지금은 화면에만 "저장됨"으로 표시한다.
// 가드레일(기획안 10장 AI 대필 금지): 초안은 제안일 뿐 자동으로 입력·저장·발송하지 않는다.
//   교사가 Tab으로 받아들이거나 직접 쓰고, 저장을 눌러야만 전달된다.

"use client";

import { useEffect, useRef, useState } from "react";
import { card, textArea } from "@/components/shared/ui";

const MAX_COMMENT_LENGTH = 500;

type DraftState =
  | { status: "loading" }
  | { status: "ready"; draft: string; isExample: boolean }
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
        if (response.status === 501) {
          setDraftState(fallbackDraft ? { status: "ready", draft: fallbackDraft, isExample: true } : { status: "unavailable" });
          return;
        }
        if (!response.ok) throw new Error(`comment-draft HTTP ${response.status}`);
        const data: { draft?: string | null } = await response.json();
        setDraftState(data.draft ? { status: "ready", draft: data.draft, isExample: false } : { status: "unavailable" });
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

  return (
    <section className={`${card} px-6 py-5`}>
      <h3 className="mb-1 text-base font-extrabold">선생님의 한마디</h3>
      <p className="mb-3.5 text-xs text-gray-500">
        선생님의 말로 다듬어 저장하면, 내일 등교 때 {studentName}에게 전달돼요.
      </p>

      <label htmlFor="teacher-comment" className="sr-only">
        {studentName}에게 전달할 코멘트
      </label>
      <div className="relative">
        {/* 고스트 텍스트 — 입력창과 같은 글꼴·여백으로 겹쳐 그린다. 입력한 부분은 투명, 이어질 초안만 회색 */}
        <div
          ref={ghostRef}
          aria-hidden
          className={`${textArea} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words border-transparent`}
        >
          <span className="text-transparent">{text}</span>
          <span className="text-gray-400">{ghost}</span>
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
          className={`${textArea} relative bg-transparent`}
        />
      </div>

      <p id="teacher-comment-hint" className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-500">
        {draftState.status === "loading" && "AI 초안을 불러오는 중…"}
        {draftState.status === "unavailable" && "AI 초안이 없어요. 직접 작성할 수 있어요."}
        {draftState.status === "ready" &&
          (ghost ? (
            <>
              회색 글씨는 AI 초안이에요.
              <kbd className="rounded border border-gray-300 bg-gray-50 px-1 font-mono text-[10px]">Tab</kbd>
              을 누르면 그대로 쓸 수 있어요.
            </>
          ) : (
            "AI 초안을 참고해 선생님의 말로 쓰고 있어요."
          ))}
        {draftState.status === "ready" && draftState.isExample && (
          <span className="rounded bg-amber-50 px-1.5 py-px font-semibold text-amber-700">API 연결 전 · 예시</span>
        )}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
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
          disabled={saved || !text.trim()}
          style={saved ? { background: "#22c55e" } : undefined}
          onClick={() => setSaved(true)}
        >
          {saved ? `✓ ${studentName}에게 전달 예정` : "저장 · 내일 전달"}
        </button>
        <span className="ml-auto text-[11px] text-gray-500">자동 발송 없음 — 저장해야 전달됩니다</span>
      </div>
      {saved && (
        <p role="status" className="mt-2 text-[11px] text-amber-700">
          최종본 저장 API 연결 전이라 아직 화면에만 반영돼요.
        </p>
      )}
    </section>
  );
}
