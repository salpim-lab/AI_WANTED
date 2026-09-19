// 담당: 김현우
// 학생관찰일지의 글쓰기 폼 — "관찰일지 기록"(DailyObservationButton)과 "학생 상담 기록"(StudentConsultationComposer)
// 팝업이 같이 쓴다. kind로 라벨과 recordType만 바꾸고 배치는 똑같다.
// 위쪽 한 줄에 관찰한 아이 태그(@이름, 필수) · 제목 · 발생 일시를 두고, 아래에 본문을 넓게 쓴다.
// 태그는 이름 문자열이 아니라 student_id로 제출된다 (TagInput). 저장에 성공하면 onSaved로 팝업을 닫는다.
// 팝업이 닫히면 Modal이 내용을 언마운트하므로 다시 열 때마다 빈 폼으로 시작한다.
// prefill(아이·일시)이 오면 그 값으로 시작한다 — 대시보드 "오늘 예정된 상담"에서 바로 넘어온 경우다.

"use client";

import { useActionState, useState } from "react";
import { createObservation } from "@/app/(teacher)/observation/actions";
import { nowKstLocalInput } from "@/components/shared/datetime";
import TagInput, { type TagOption } from "@/components/shared/TagInput";
import { errorText, fieldLabel, helperNote, textArea, textInput } from "@/components/shared/ui";
import type { ClassStudent, FormActionState } from "@/lib/types/teacherRecord";

const INITIAL_STATE: FormActionState = { status: "idle", message: null, seq: 0 };
const MAX_TITLE_LENGTH = 100;
const MAX_BODY_LENGTH = 5000;
/** 맨 윗줄 칸 제목 — fieldLabel에서 위 여백만 뺀 것 (줄바꿈 간격은 grid gap이 맡는다) */
const topFieldLabel = "mb-1.5 block text-xs font-bold tracking-[0.5px] text-[#7d849b]";

const LABELS = {
  observation: {
    tags: "관찰한 아이",
    occurredAt: "발생 일시",
    body: "관찰 내용",
    placeholder: "관찰한 내용을 적어주세요…",
    titlePlaceholder: "예: 점심시간 갈등 - 진술 청취",
  },
  student_consultation: {
    tags: "상담한 아이",
    occurredAt: "상담 일시",
    body: "상담 내용",
    placeholder: "아이와 나눈 이야기와 상담 내용을 적어주세요…",
    titlePlaceholder: "예: 친구 관계 고민 상담",
  },
} as const;

export type WriteKind = keyof typeof LABELS;

/** 열릴 때 미리 채워 둘 값 — 예정돼 있던 상담을 기록하러 넘어온 경우 */
export type WritePrefill = {
  studentIds: string[];
  /** <input type="datetime-local"> 값 ("2026-09-18T12:40") */
  occurredAt: string;
};

export default function ObservationWriteForm({
  kind,
  students,
  date,
  today,
  prefill,
  onSaved,
}: {
  kind: WriteKind;
  students: ClassStudent[];
  date: string;
  today: string;
  prefill?: WritePrefill;
  onSaved: () => void;
}) {
  const labels = LABELS[kind];
  const options: TagOption[] = students.map((s) => ({ id: s.studentId, label: s.name }));

  const [tags, setTags] = useState<TagOption[]>(
    () => options.filter((o) => prefill?.studentIds.includes(o.id)),
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  // 오늘 날짜면 지금 시각으로 채워서 발생 일시가 비어 보이지 않게 하고, 지난 날짜를 보는 중이면 그 날
  // 정오로 채운다 (안 그러면 지난 날짜를 쓰다가 빈칸으로 두면 "지금" 시각이 들어가 오늘 피드로 잡혀버린다)
  const defaultOccurredAt = prefill?.occurredAt ?? (date === today ? nowKstLocalInput() : `${date}T12:00`);

  const [state, formAction, pending] = useActionState(async (previous: FormActionState, formData: FormData) => {
    const result = await createObservation(formData);
    if (result.status === "success") onSaved();
    return { ...result, seq: previous.seq + 1 };
  }, INITIAL_STATE);

  return (
    <form action={formAction}>
      {kind === "student_consultation" && <input type="hidden" name="recordType" value="student_consultation" />}
      <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_200px]">
        <div>
          <label htmlFor="obs-tags" className={topFieldLabel}>
            {labels.tags}
          </label>
          <TagInput options={options} value={tags} onChange={setTags} name="studentIds" inputId="obs-tags" />
        </div>
        <div>
          <label htmlFor="obs-title" className={topFieldLabel}>
            제목
          </label>
          <input
            id="obs-title"
            name="title"
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            placeholder={labels.titlePlaceholder}
            onChange={(e) => setTitle(e.target.value)}
            className={`${textInput} w-full`}
          />
        </div>
        <div>
          <label htmlFor="obs-occurred-at" className={topFieldLabel}>
            {labels.occurredAt}
          </label>
          <input
            id="obs-occurred-at"
            type="datetime-local"
            name="occurredAt"
            defaultValue={defaultOccurredAt}
            className={`${textInput} w-full`}
          />
        </div>
      </div>

      <label htmlFor="obs-body" className={fieldLabel}>
        {labels.body}
      </label>
      <textarea
        id="obs-body"
        name="body"
        rows={10}
        required
        value={body}
        maxLength={MAX_BODY_LENGTH}
        placeholder={labels.placeholder}
        onChange={(e) => setBody(e.target.value)}
        className={textArea}
      />
      <div className="mt-1 text-right text-[11px] text-[#aab0c4]">
        {body.length} / {MAX_BODY_LENGTH}
      </div>

      <p className={helperNote}>🔒 저장 후 수정할 수 없습니다.</p>
      {state.seq > 0 && state.status === "error" && (
        <p role="alert" className={errorText}>
          {state.message}
        </p>
      )}

      <div className="mt-[14px] flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={pending || tags.length === 0 || !body.trim()}>
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}
