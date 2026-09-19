// 담당: 김현우
// 학부모상담기록 — 왼쪽 "예정된 상담"(아직 안 함, 누적 자료로 준비) / 오른쪽 "완료한 상담"(끝난 것,
// 실제 나눈 이야기 열람) 두 칼럼. 예정 카드는 가로 한 줄짜리 행이고, 완료한 상담 카드는 학생관찰일지 피드 카드와 같은 세로 모양이다. 머리줄에 날짜(DateControl)·검색과 [상담 예약]·[상담 기록] 버튼을 같이 둔다.
// 두 칼럼 모두 고른 날짜의 상담만 보여주고, 날짜를 안 골랐으면(기본, "전체") 기간 제한 없이 다 보여준다. 학생·키워드로 검색 중이면 완료한 상담은 전체 기간에서 찾는다.
// 검색(RecordSearch)은 입력하는 대로 URL을 바꾸고 서버가 다시 조회한다 — 완료한 상담에만 적용한다
// (예정은 보통 몇 건 안 돼서 검색이 필요 없다).
// 예정 카드(ScheduledConsultationCard): 카드를 누르면 상담 내용 작성 팝업, ✎는 일정 변경.
// 무결성 원칙: 수정·삭제 UI 없음. "기록" 시각은 서버가 찍은 시각만 표시한다.
// 참고: docs/planning/PLANNING.md "탭 4. 학부모상담기록", docs/prototype/prototype-teacher.html #consultation-list

import { emptyState, boardPageContainer, boardPageTitle } from "@/components/shared/ui";
import RecordDateScope from "@/components/shared/RecordDateScope";
import type { ClassStudent, ConsultationFilter, ConsultationLog, ScheduledConsultation } from "@/lib/types/teacherRecord";
import CompletedConsultationCard from "./CompletedConsultationCard";
import ConsultationComposer from "./ConsultationComposer";
import RecordSearch from "@/components/shared/RecordSearch";
import ScheduleConsultationComposer from "./ScheduleConsultationComposer";
import ScheduledConsultationCard from "./ScheduledConsultationCard";

export default function ConsultationBoard({
  entries,
  scheduled,
  students,
  filter,
  date,
  today,
  reportDays,
}: {
  entries: ConsultationLog[];
  scheduled: ScheduledConsultation[];
  students: ClassStudent[];
  filter: ConsultationFilter;
  /** YYYY-MM-DD (KST) — 예정 목록은 이 날짜부터 앞으로, 완료 목록은 이 날짜 하루로 거른다 (검색 중이면 완료 목록은 전체 기간). null이면 "전체" — 날짜로 거르지 않는다 */
  date: string | null;
  today: string;
  reportDays: number;
}) {
  const hasFilter = Boolean(filter.keyword || filter.studentId);

  return (
    <div className={boardPageContainer}>
      <div className="relative z-20 mb-5 flex flex-wrap items-center gap-2.5">
        <h2 className={`${boardPageTitle} shrink-0`}>학부모상담기록</h2>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <RecordDateScope date={date} today={today} basePath="/consultation" />
          <RecordSearch basePath="/consultation" students={students} filter={filter} />
          <ScheduleConsultationComposer students={students} />
          <ConsultationComposer students={students} reportDays={reportDays} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="mb-3 font-[family-name:var(--font-cute)] text-[17px] font-normal text-[#102a56]">
            예정된 상담 {scheduled.length}건
          </h3>

          {scheduled.length === 0 ? (
            <div className={emptyState}>{date ? "이 날짜부터 예정된 상담이 없어요." : "예정된 상담이 없어요."}</div>
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

        <section className="lg:border-l lg:border-[#e6e2fb] lg:pl-6">
          <h3 className="mb-3 font-[family-name:var(--font-cute)] text-[17px] font-normal text-[#102a56]">
            완료한 상담 {hasFilter ? `검색 결과 ${entries.length}건` : `${entries.length}건`}
          </h3>

          {entries.length === 0 ? (
            <div className={emptyState}>{hasFilter ? "조건에 맞는 상담 기록이 없어요." : date ? "이 날짜에 완료한 상담이 없어요." : "완료한 상담이 없어요."}</div>
          ) : (
            <ul className="grid gap-2.5">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <CompletedConsultationCard entry={entry} showDate={hasFilter || !date} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
