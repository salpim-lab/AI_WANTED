// 담당: 김현우
// 학생관찰일지 — 하루 단위 작업 화면. 위쪽에서 "관찰일지 기록"/"학생 상담 기록" 버튼으로 그날 쓸 아이를
// 고르고 바로 적는 팝업을 열고(DailyObservationButton/StudentConsultationComposer), 아래는 그날의
// 관찰·학생상담 기록을 모아 보는 피드다. 버튼은 지금 보는 종류 탭에 맞는 것만 보여준다 — 전체면 둘 다,
// 관찰이면 관찰일지 기록만, 상담이면 학생 상담 기록만.
// "상담"은 아이 본인과의 상담이다 — 학부모 상담(학부모상담기록 화면)은 여기서 다루지 않는다. 관찰과 학생상담은
// 같은 work_records 테이블(recordType만 다름)이라 서로 다른 데이터 소스를 합칠 필요 없이 한 목록을 걸러서 쓴다.
// 무결성 원칙: 수정·삭제 UI 없음. "기록" 시각은 서버가 찍은 created_at만 표시한다.
// 참고: docs/planning/PLANNING.md "탭 3. 학생관찰일지"

import Form from "next/form";
import Link from "next/link";
import { formatKstDate, formatKstDateTime } from "@/components/shared/datetime";
import { card, emptyState, immutableBadge, boardPageContainer, boardPageTitle, textInput, timestampText } from "@/components/shared/ui";
import type { ClassStudent, ObservationLog, RecordTypeFilter } from "@/lib/types/teacherRecord";
import DailyObservationButton from "./DailyObservationButton";
import DateControl from "@/components/teacher/shared/DateControl";
import ObservationTypeTabs from "./ObservationTypeTabs";
import StudentConsultationComposer from "./StudentConsultationComposer";

const RECORD_TYPE_TAG: Record<ObservationLog["recordType"], string> = {
  general: "bg-sky-50 text-sky-700",
  conflict: "bg-rose-50 text-rose-700",
  student_consultation: "bg-violet-50 text-violet-700",
};

const RECORD_TYPE_LABEL: Record<ObservationLog["recordType"], string> = {
  general: "관찰",
  conflict: "갈등",
  student_consultation: "상담",
};

/** 발생 시각이 기록 시각과 이만큼 이상 다를 때만 따로 표시 */
const OCCURRED_AT_DISPLAY_THRESHOLD_MS = 60_000;

function matchesType(entry: ObservationLog, type: RecordTypeFilter): boolean {
  if (type === "all") return true;
  if (type === "consultation") return entry.recordType === "student_consultation";
  return entry.recordType !== "student_consultation";
}

export default function ObservationBoard({
  students,
  date,
  today,
  type,
  keyword,
  recordedStudentIds,
  observations,
}: {
  students: ClassStudent[];
  date: string;
  today: string;
  type: RecordTypeFilter;
  /** 있으면 날짜 제한 없이 전체 기간에서 검색한 결과를 보고 있는 상태다 */
  keyword?: string;
  /** 이 날짜에 관찰 기록이 태그된 아이 id — 워크스페이스 명단의 완료 표시용 (학생상담은 별개라 포함하지 않는다) */
  recordedStudentIds: string[];
  observations: ObservationLog[];
}) {
  const items = observations.filter((entry) => matchesType(entry, type));
  const searching = Boolean(keyword);
  const soloItems = items.filter((entry) => entry.taggedStudents.length <= 1);
  const multiItems = items.filter((entry) => entry.taggedStudents.length > 1);

  return (
    <div className={boardPageContainer}>
      <div className="mb-5 flex flex-nowrap items-center gap-1.5 overflow-x-auto">
        <h2 className={`${boardPageTitle} shrink-0`}>학생관찰일지</h2>
        <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1.5">
          <DateControl dateKey={date} today={today} basePath="/observation" maxDate={today} />
          <Form action="/observation" role="search" className="flex shrink-0 flex-nowrap items-center gap-1.5">
            <input type="hidden" name="date" value={date} />
            {type !== "all" && <input type="hidden" name="type" value={type} />}
            <input
              type="search"
              name="q"
              defaultValue={keyword ?? ""}
              placeholder="키워드 검색…"
              aria-label="키워드 검색"
              className={`${textInput} w-32`}
            />
            <button type="submit" className="btn btn-primary btn-sm shrink-0">
              검색
            </button>
            {searching && (
              <Link
                href={`/observation?date=${date}${type !== "all" ? `&type=${type}` : ""}`}
                className="btn btn-ghost btn-sm inline-block shrink-0"
              >
                검색 지우기
              </Link>
            )}
          </Form>
          <ObservationTypeTabs type={type} />
          {type !== "consultation" && (
            <DailyObservationButton
              students={students}
              recordedStudentIds={recordedStudentIds}
              date={date}
              today={today}
            />
          )}
          {type !== "observation" && <StudentConsultationComposer students={students} />}
        </div>
      </div>

      <h3 className="mb-2.5 font-[family-name:var(--font-cute)] text-[17px] font-normal text-[#102a56]">
        {searching ? `"${keyword}" 검색 결과` : `${formatKstDate(date)} 기록`} · {items.length}건
      </h3>

      {items.length === 0 ? (
        <div className={emptyState}>{searching ? "검색 결과가 없어요." : "이 날짜엔 기록이 없어요."}</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <h4 className="mb-2 text-xs font-bold text-[#7d849b]">한 아이 기록 · {soloItems.length}건</h4>
            {soloItems.length === 0 ? (
              <div className={emptyState}>해당하는 기록이 없어요.</div>
            ) : (
              <ul className="grid gap-2.5">
                {soloItems.map((entry) => (
                  <li key={entry.id}>
                    <ObservationFeedCard entry={entry} showDate={searching} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="lg:border-l lg:border-[#e6e2fb] lg:pl-6">
            <h4 className="mb-2 text-xs font-bold text-[#7d849b]">여러 아이가 태그된 기록 · {multiItems.length}건</h4>
            {multiItems.length === 0 ? (
              <div className={emptyState}>해당하는 기록이 없어요.</div>
            ) : (
              <ul className="grid gap-2.5">
                {multiItems.map((entry) => (
                  <li key={entry.id}>
                    <ObservationFeedCard entry={entry} showDate={searching} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ObservationFeedCard({ entry, showDate }: { entry: ObservationLog; showDate: boolean }) {
  const showOccurredAt =
    Math.abs(new Date(entry.occurredAt).getTime() - new Date(entry.createdAt).getTime()) >=
    OCCURRED_AT_DISPLAY_THRESHOLD_MS;

  return (
    <article className={`${card} h-full px-[18px] py-4`}>
      <header className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${RECORD_TYPE_TAG[entry.recordType]}`}>
          {RECORD_TYPE_LABEL[entry.recordType]}
        </span>
        <time dateTime={entry.createdAt} className={timestampText}>
          {showDate ? formatKstDateTime(entry.createdAt).slice(0, 16) : formatKstDateTime(entry.createdAt).slice(11, 16)}
        </time>
        {showOccurredAt && (
          <time dateTime={entry.occurredAt} className={timestampText}>
            · 발생 {formatKstDateTime(entry.occurredAt).slice(0, 16)}
          </time>
        )}
        <span className={immutableBadge}>🔒 수정 불가</span>
      </header>
      {entry.title && <h3 className="mb-1.5 text-sm font-bold">{entry.title}</h3>}
      <p className="text-[13px] leading-[1.7] whitespace-pre-wrap">{entry.body}</p>
      {entry.taggedStudents.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {entry.taggedStudents.map((tag) => (
            <Link
              key={tag.studentId}
              href={`/students/${tag.studentId}`}
              className="rounded-full bg-[#ede9ff] px-2 py-0.5 text-[11px] font-semibold text-[#3f37c9] transition-colors hover:bg-[#ded8ff]"
            >
              @{tag.name}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
