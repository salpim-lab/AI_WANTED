// 담당: 김현우
// 학생관찰일지 상단 워크스페이스의 오른쪽 — 고른 아이의 "그날 상황" 요약(등교/하교 색, AI 분석 참고)을 먼저
// 보여주고 바로 아래에 그 아이로 미리 태그된 관찰 기록 입력창을 둔다. 저장하면 부모(Workspace)에 알려서
// 다음 안 적은 아이로 넘어가게 한다. date+studentId가 바뀌면 부모가 key를 바꿔 이 컴포넌트를 새로 마운트한다
// (그래서 폼 상태가 아이마다 저절로 초기화된다 — 수동 리셋 로직이 필요 없다).

"use client";

import { useActionState, useEffect, useState } from "react";
import { createObservation, getStudentDayContext, type StudentDayContext } from "@/app/(teacher)/observation/actions";
import { nowKstLocalInput } from "@/components/shared/datetime";
import TagInput, { type TagOption } from "@/components/shared/TagInput";
import { SIGNAL_LABEL } from "@/components/shared/signalStyles";
import { card, errorText, fieldLabel, helperNote, textArea, textInput } from "@/components/shared/ui";
import type { ClassStudent, FormActionState } from "@/lib/types/teacherRecord";

const INITIAL_STATE: FormActionState = { status: "idle", message: null, seq: 0 };
const MAX_TITLE_LENGTH = 100;
const MAX_BODY_LENGTH = 5000;

export default function DailyWritePanel({
  student,
  otherStudents,
  date,
  today,
  onSaved,
}: {
  student: ClassStudent;
  /** TagInput 후보 — 선택된 아이를 뺀 나머지 (갈등 등 같이 태그할 아이가 있을 때만 씀) */
  otherStudents: ClassStudent[];
  date: string;
  today: string;
  onSaved: (studentId: string) => void;
}) {
  const options: TagOption[] = otherStudents.map((s) => ({ id: s.studentId, label: s.name }));

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [extraTags, setExtraTags] = useState<TagOption[]>([]);
  const [context, setContext] = useState<StudentDayContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);

  // 오늘 날짜면 지금 시각으로 채워서 발생 일시가 비어 보이지 않게 하고, 지난 날짜를 고른 중이면 그 날
  // 정오로 채운다 (안 그러면 지난 날짜를 쓰다가 빈칸으로 두면 "지금" 시각이 들어가 오늘 피드로 잡혀버린다)
  const defaultOccurredAt = date === today ? nowKstLocalInput() : `${date}T12:00`;

  const [state, formAction, pending] = useActionState(async (previous: FormActionState, formData: FormData) => {
    const result = await createObservation(formData);
    if (result.status === "success") onSaved(student.studentId);
    return { ...result, seq: previous.seq + 1 };
  }, INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;
    getStudentDayContext(student.studentId, date).then((c) => {
      if (!cancelled) {
        setContext(c);
        setContextLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [student.studentId, date]);

  return (
    <div>
      <div className={`${card} mb-3 px-4 py-3`}>
        <div className="mb-1.5 text-xs font-bold tracking-[0.5px] text-[#7d849b]">오늘 {student.name}</div>
        {contextLoading ? (
          <p className="text-[13px] text-[#aab0c4]">불러오는 중…</p>
        ) : (
          <>
            <p className="text-[13px] text-[#33405f]">
              등교 {context?.morning ? SIGNAL_LABEL[context.morning] : "기록 없음"} · 하교{" "}
              {context?.afternoon ? SIGNAL_LABEL[context.afternoon] : "기록 없음"}
            </p>
            {context?.aiSummary ? (
              <p className="mt-1.5 text-[13px] leading-[1.6] text-[#5d6580]">{context.aiSummary}</p>
            ) : (
              <p className="mt-1.5 text-[13px] text-[#aab0c4]">이 날은 등하교 체크인 기록이 없어요.</p>
            )}
            <p className="mt-1.5 text-[11px] text-[#aab0c4]">AI 요약은 참고용이며 진단이나 판정이 아니에요.</p>
          </>
        )}
      </div>

      <form action={formAction}>
        <input type="hidden" name="studentIds" value={student.studentId} />

        <div className="mb-2 flex items-center gap-1.5">
          <span className="rounded-full bg-[#ede9ff] px-2.5 py-1 text-xs font-bold text-[#3f37c9]">{student.name}</span>
          <span className="text-xs text-[#7d849b]">에 대한 관찰 기록</span>
        </div>

        <textarea
          name="body"
          rows={5}
          required
          autoFocus
          value={body}
          maxLength={MAX_BODY_LENGTH}
          placeholder="오늘 관찰한 내용을 적어주세요…"
          onChange={(e) => setBody(e.target.value)}
          className={textArea}
        />
        <div className="mt-1 text-right text-[11px] text-[#aab0c4]">
          {body.length} / {MAX_BODY_LENGTH}
        </div>

        <label htmlFor="daily-obs-title" className={fieldLabel}>
          제목 (선택)
        </label>
        <input
          id="daily-obs-title"
          name="title"
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          placeholder="예: 점심시간 갈등 — 진술 청취"
          onChange={(e) => setTitle(e.target.value)}
          className={`${textInput} w-full`}
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="daily-obs-occurred-at" className={fieldLabel}>
              발생 일시 (선택)
            </label>
            <input
              id="daily-obs-occurred-at"
              type="datetime-local"
              name="occurredAt"
              defaultValue={defaultOccurredAt}
              className={`${textInput} w-full`}
            />
          </div>
          <div>
            <label htmlFor="daily-obs-extra-tags" className={fieldLabel}>
              다른 아이도 함께 태그 (선택)
            </label>
            <TagInput
              options={options}
              value={extraTags}
              onChange={setExtraTags}
              name="studentIds"
              inputId="daily-obs-extra-tags"
            />
          </div>
        </div>

        <p className={helperNote}>🔒 저장 후 수정할 수 없습니다.</p>
        {state.seq > 0 && state.status === "error" && (
          <p role="alert" className={errorText}>
            {state.message}
          </p>
        )}

        <div className="mt-[14px] flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={pending || !body.trim()}>
            {pending ? "저장 중…" : "저장하고 다음 아이로"}
          </button>
        </div>
      </form>
    </div>
  );
}
