// 담당: 김현우
// 아이 상세 하단 "내일 전달할 코멘트". 초안 생성과 저장은 이유민 소유(feedback_drafts) — 여기서는 fetch만.
//   초안: POST /api/ai/comment-draft { studentId, date } → 200 { draft: string }
//         라우트가 아직 501(미구현)이면 서버가 넘겨준 mock 예시(fallbackDraft)를 "예시" 표시와 함께 쓴다.
//   저장: 교사 최종본(feedback_drafts.final_text)을 저장하는 이유민 소유 라우트가 아직 없다.
//         TODO(이유민 라우트 준비 후): 저장 버튼에서 그 라우트를 fetch. 지금은 화면에만 "저장됨"으로 표시한다.
// 가드레일(기획안 10장 AI 대필 금지): 자동 발송·자동 저장 없음. 교사가 읽고 저장을 눌러야만 전달된다.

"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    const controller = new AbortController();

    function applyDraft(draft: string, isExample: boolean) {
      setDraftState({ status: "ready", draft, isExample });
      // 교사가 이미 쓰기 시작했으면 덮어쓰지 않는다
      setText((current) => current || draft);
    }

    fetch("/api/ai/comment-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, date }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 501) {
          if (fallbackDraft) applyDraft(fallbackDraft, true);
          else setDraftState({ status: "unavailable" });
          return;
        }
        if (!response.ok) throw new Error(`comment-draft HTTP ${response.status}`);
        const data: { draft?: string | null } = await response.json();
        if (data.draft) applyDraft(data.draft, false);
        else setDraftState({ status: "unavailable" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[CommentComposer]", error);
        setDraftState({ status: "unavailable" });
      });

    return () => controller.abort();
  }, [studentId, date, fallbackDraft]);

  return (
    <section className={`${card} px-6 py-5`}>
      <h3 className="mb-1 text-base font-extrabold">선생님의 한마디</h3>
      <p className="mb-3.5 text-xs text-gray-500">
        AI 초안을 읽고 선생님의 말로 다듬어 저장하면, 내일 등교 때 {studentName}에게 전달돼요.
      </p>

      {draftState.status === "loading" && <p className="mb-2.5 text-xs text-gray-500">초안을 불러오는 중…</p>}
      {draftState.status === "unavailable" && (
        <p className="mb-2.5 text-xs text-gray-500">AI 초안이 없어요. 직접 작성할 수 있어요.</p>
      )}
      {draftState.status === "ready" && (
        <div className="mb-2.5 rounded-[9px] border-[1.5px] border-sky-200 bg-sky-50 px-3.5 py-3 text-[13px] leading-[1.6] text-sky-900">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.5px] text-sky-700">
            AI 초안
            {draftState.isExample && (
              <span className="rounded bg-white/70 px-1.5 py-px font-semibold text-amber-700">API 연결 전 · 예시</span>
            )}
          </div>
          {draftState.draft}
        </div>
      )}

      <label htmlFor="teacher-comment" className="sr-only">
        {studentName}에게 전달할 코멘트
      </label>
      <textarea
        id="teacher-comment"
        rows={3}
        value={text}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder="코멘트를 적어주세요…"
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        className={textArea}
      />

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={draftState.status !== "ready"}
          onClick={() => {
            if (draftState.status !== "ready") return;
            setText(draftState.draft);
            setSaved(false);
          }}
        >
          초안으로 되돌리기
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
          저장 API(이유민 담당) 연결 전이라 아직 화면에만 반영돼요.
        </p>
      )}
    </section>
  );
}
