// 담당: 김현우
// 학생관찰일지 — 하루 단위 작업 화면. 위쪽에서 "관찰일지 기록"/"학생 상담 기록" 버튼으로 아이를
// 태그하고 바로 적는 팝업을 열고(DailyObservationButton/StudentConsultationComposer), 아래는 그날의
// 관찰·학생상담 기록을 모아 보는 피드다. 카드를 누르면 기록 전체가 모달로 열린다(ObservationFeedCard). 버튼은 지금 보는 종류 탭에 맞는 것만 보여준다 — 전체면 둘 다,
// 관찰이면 관찰일지 기록만, 상담이면 학생 상담 기록만.
// "상담"은 아이 본인과의 상담이다 — 학부모 상담(학부모상담기록 화면)은 여기서 다루지 않는다. 관찰과 학생상담은
// 같은 work_records 테이블(recordType만 다름)이라 서로 다른 데이터 소스를 합칠 필요 없이 한 목록을 걸러서 쓴다.
// 머리줄: [날짜] [학생 ▾] [키워드] 순서로 학부모상담기록과 같은 모양 — 검색(RecordSearch)은 버튼 없이 입력하는 대로 반영된다.
// 머리줄은 overflow를 걸지 않는다 — 걸면 날짜 칸(DateControl)의 달력 팝업이 머리줄 안에 갇혀 잘린다.
// 무결성 원칙: 수정·삭제 UI 없음. "기록" 시각은 서버가 찍은 created_at만 표시한다.
// 참고: docs/planning/PLANNING.md "탭 3. 학생관찰일지"

import { formatKstDate } from "@/components/shared/datetime";
import RecordSearch from "@/components/shared/RecordSearch";
import { emptyState, boardPageContainer, boardPageTitle } from "@/components/shared/ui";
import type { ClassStudent, ObservationLog, RecordTypeFilter } from "@/lib/types/teacherRecord";
import DailyObservationButton from "./DailyObservationButton";
import DateControl from "@/components/teacher/shared/DateControl";
import ObservationFeedCard from "./ObservationFeedCard";
import ObservationTypeTabs from "./ObservationTypeTabs";
import StudentConsultationComposer from "./StudentConsultationComposer";

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
  studentId,
  observations,
}: {
  students: ClassStudent[];
  date: string;
  today: string;
  type: RecordTypeFilter;
  /** keyword·studentId 중 하나라도 있으면 날짜 제한 없이 전체 기간에서 검색한 결과를 보고 있는 상태다 */
  keyword?: string;
  studentId?: string;
  observations: ObservationLog[];
}) {
  const items = observations.filter((entry) => matchesType(entry, type));
  const searching = Boolean(keyword || studentId);
  const searchLabel = [
    studentId && students.find((s) => s.studentId === studentId)?.name,
    keyword && `"${keyword}"`,
  ]
    .filter(Boolean)
    .join(" - ");
  const soloItems = items.filter((entry) => entry.taggedStudents.length <= 1);
  const multiItems = items.filter((entry) => entry.taggedStudents.length > 1);

  return (
    <div className={boardPageContainer}>
      <div className="relative z-20 mb-5 flex flex-wrap items-center gap-1.5">
        <h2 className={`${boardPageTitle} shrink-0`}>학생관찰일지</h2>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <DateControl dateKey={date} today={today} basePath="/observation" maxDate={today} />
          <RecordSearch basePath="/observation" students={students} filter={{ keyword, studentId }} />
          <ObservationTypeTabs type={type} />
          {type !== "consultation" && (
            <DailyObservationButton students={students} date={date} today={today} />
          )}
          {type !== "observation" && <StudentConsultationComposer students={students} date={date} today={today} />}
        </div>
      </div>

      <h3 className="mb-2.5 font-[family-name:var(--font-cute)] text-[17px] font-normal text-[#102a56]">
        {searching ? `${searchLabel} 검색 결과` : `${formatKstDate(date)} 기록`} {items.length}건
      </h3>

      {items.length === 0 ? (
        <div className={emptyState}>{searching ? "검색 결과가 없어요." : "이 날짜엔 기록이 없어요."}</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <h4 className="mb-2 text-xs font-bold text-[#7d849b]">한 아이 기록 {soloItems.length}건</h4>
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
            <h4 className="mb-2 text-xs font-bold text-[#7d849b]">여러 아이가 태그된 기록 {multiItems.length}건</h4>
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

