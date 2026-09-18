// 담당: 김현우
// 학부모상담기록 — 왼쪽 "예정된 상담"(아직 안 함, 누적 자료로 준비) / 오른쪽 "완료한 상담"(끝난 것,
// 실제 나눈 이야기 열람) 두 칼럼. 검색은 GET 폼(next/form)으로 URL을 바꾸고 서버가 다시 조회한다 —
// 완료한 상담에만 적용한다(예정은 보통 몇 건 안 돼서 검색이 필요 없다).
// 무결성 원칙: 수정·삭제 UI 없음. "기록" 시각은 서버가 찍은 시각만 표시한다.
// 참고: docs/planning/PLANNING.md "탭 4. 학부모상담기록", docs/prototype/prototype-teacher.html #consultation-list

import Form from "next/form";
import Link from "next/link";
import { formatKstDateTime } from "@/components/shared/datetime";
import { card, emptyState, boardPageContainer, boardPageTitle, textInput, timestampText } from "@/components/shared/ui";
import type {
  ClassStudent,
  ConsultationFilter,
  ConsultationLog,
  ConsultationMethod,
  ScheduledConsultation,
} from "@/lib/types/teacherRecord";
import CompleteConsultationButton from "./CompleteConsultationButton";
import EditScheduledConsultationButton from "./EditScheduledConsultationButton";
import CompletedConsultationCard from "./CompletedConsultationCard";
import ConsultationComposer from "./ConsultationComposer";
import ScheduleConsultationComposer from "./ScheduleConsultationComposer";

const METHOD_LABEL: Record<ConsultationMethod, string> = { phone: "전화", visit: "방문", online: "온라인" };

export default function ConsultationBoard({
  entries,
  scheduled,
  students,
  filter,
  reportDays,
}: {
  entries: ConsultationLog[];
  scheduled: ScheduledConsultation[];
  students: ClassStudent[];
  filter: ConsultationFilter;
  reportDays: number;
}) {
  const hasFilter = Boolean(filter.keyword || filter.studentId);
  const filterKey = [filter.keyword, filter.studentId].join("|");

  return (
    <div className={boardPageContainer}>
      <h2 className={`${boardPageTitle} mb-5`}>학부모상담기록</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <h3 className="flex-1 text-sm font-extrabold text-gray-700">예정된 상담 · {scheduled.length}건</h3>
            <ScheduleConsultationComposer students={students} />
          </div>

          {scheduled.length === 0 ? (
            <div className={emptyState}>예정된 상담이 없어요.</div>
          ) : (
            <ul className="grid gap-2.5">
              {scheduled.map((item) => (
                <li key={item.id}>
                  <ScheduledConsultationCard consultation={item} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:border-l lg:border-gray-200 lg:pl-6">
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <h3 className="flex-1 text-sm font-extrabold text-gray-700">완료한 상담</h3>
            <ConsultationComposer students={students} reportDays={reportDays} />
          </div>

          <Form key={filterKey} action="/consultation" role="search" className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              name="q"
              defaultValue={filter.keyword ?? ""}
              placeholder="키워드 검색…"
              aria-label="키워드"
              className={`${textInput} w-40`}
            />
            <select name="student" defaultValue={filter.studentId ?? ""} aria-label="학생" className={textInput}>
              <option value="">전체 학생</option>
              {students.map((s) => (
                <option key={s.studentId} value={s.studentId}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary btn-sm">
              검색
            </button>
            {hasFilter && (
              <Link href="/consultation" className="btn btn-ghost btn-sm inline-block">
                초기화
              </Link>
            )}
          </Form>

          <p className="mb-2.5 text-xs text-gray-500">
            {hasFilter ? `검색 결과 ${entries.length}건` : `전체 ${entries.length}건`}
          </p>

          {entries.length === 0 ? (
            <div className={emptyState}>{hasFilter ? "조건에 맞는 상담 기록이 없어요." : "아직 완료한 상담이 없어요."}</div>
          ) : (
            <ul className="grid gap-2.5">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <CompletedConsultationCard entry={entry} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ScheduledConsultationCard({ consultation }: { consultation: ScheduledConsultation }) {
  return (
    <article className={`${card} px-[18px] py-4`}>
      <header className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          href={`/students/${consultation.student.studentId}`}
          className="rounded-full bg-green-50 px-[9px] py-0.5 text-xs font-bold text-green-700 transition-colors hover:bg-green-100"
        >
          {consultation.student.name}
        </Link>
        <span className="rounded-full bg-amber-100 px-[9px] py-0.5 text-xs font-bold text-amber-800">
          {consultation.counterpart} · {METHOD_LABEL[consultation.method]}
        </span>
      </header>
      <p className={timestampText}>예정 {formatKstDateTime(consultation.scheduledAt).slice(0, 16)}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Link
          href={`/consultation/report/${consultation.student.studentId}`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 transition-colors hover:bg-green-100"
        >
          📄 {consultation.student.name} 누적 자료 보기
        </Link>
        <EditScheduledConsultationButton consultation={consultation} />
        <CompleteConsultationButton consultation={consultation} />
      </div>
    </article>
  );
}
