// 담당: 김현우
// 아이 상세 본문 — Server Component. 자리 배치도 오른쪽 열(StudentsSplitView)에 열린다.
//   카드 1: 아이 헤더(이름·날짜 선택·닫기) + 최근 날짜 칸 + 등교/하교 마음 기록(대화 전문) + AI 분석
//   카드 2: 선생님의 한마디 (오늘 날짜에서만)
// 참고: docs/planning/PLANNING.md "탭 2. 아이 상세 페이지"
// AI 분석·코멘트는 다른 담당자의 API route를 클라이언트 컴포넌트에서 fetch로만 호출한다:
//   - 분석: POST /api/ai/daily-analysis (이지현 소유 — analysis_runs)   → AiAnalysisBox
//   - 초안: POST /api/ai/comment-draft (이유민 소유 — feedback_drafts) → CommentComposer
// lib/supabase/interpretation/{teacherComment,dailyAnalysis}.ts는 직접 import하지 말 것.
// (참고: docs/planning/살핌_DB_스키마_v0.3.md §13 담당자별 작업 경계)

import Link from "next/link";
import { formatKstDate, formatKstDateTime } from "@/components/shared/datetime";
import { givenName } from "@/components/shared/names";
import { SIGNAL_DOT, SIGNAL_LABEL } from "@/components/shared/signalStyles";
import { card, timestampText } from "@/components/shared/ui";
import type { ClassStudent, ColorHistoryDay, DaySession } from "@/lib/types/teacherRecord";
import AiAnalysisBox from "./AiAnalysisBox";
import CommentComposer from "./CommentComposer";
import ConversationTurns from "./ConversationTurns";
import MiniCalendar from "./MiniCalendar";
import StudentDatePicker from "./StudentDatePicker";

export default function StudentDetailPanel({
  student,
  date,
  today,
  sessions,
  history,
  preview,
}: {
  student: ClassStudent;
  date: string;
  today: string;
  sessions: DaySession[];
  history: ColorHistoryDay[];
  preview: { analysis: string | null; draft: string | null };
}) {
  const isToday = date === today;
  const shortName = givenName(student.name);

  const morningSessions = sessions.filter((s) => s.period === "morning");
  const afternoonSessions = sessions.filter((s) => s.period === "afternoon");
  const latestStart = (list: DaySession[]) =>
    [...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.startedAt;
  const morningStart = latestStart(morningSessions);
  const afternoonStart = latestStart(afternoonSessions);
  // 두 시간대 중 가장 최근 기록이 있는 쪽을 "지금" 시간대로 강조한다 (ClassPlaybook류 타임라인 참고)
  const activePeriod = morningStart && afternoonStart
    ? morningStart > afternoonStart
      ? "morning"
      : "afternoon"
    : morningStart
      ? "morning"
      : afternoonStart
        ? "afternoon"
        : null;

  return (
    <div className="space-y-4">
      <article className={`${card} px-6 py-5`}>
        <header className="flex flex-wrap items-center gap-3.5">
          <div
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-lg font-bold text-indigo-500"
          >
            {shortName.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold">{shortName}의 하루</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {student.name} · {formatKstDate(date)}
              {isToday && " · 오늘"}
            </p>
          </div>
          <StudentDatePicker studentId={student.studentId} date={date} today={today} />
          <Link
            href="/students"
            scroll={false}
            aria-label="상세 닫기"
            className="rounded-lg px-2 py-1 text-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </Link>
        </header>

        <div className="mt-4">
          <MiniCalendar studentId={student.studentId} history={history} selectedDate={date} today={today} />
        </div>

        {sessions.length === 0 ? (
          <div className="mt-4 border-t border-gray-200 py-10 text-center text-gray-500">
            <div className="mb-2.5 text-[32px]">🌱</div>
            <div>이 날은 쌓인 기록이 없어요.</div>
          </div>
        ) : (
          <>
            <div className="mt-4 border-t border-gray-200 pt-4">
              <PeriodSection
                icon={<SunIcon />}
                label="등교 마음 기록"
                sessions={morningSessions}
                studentName={student.name}
                active={activePeriod === "morning"}
                isLast={false}
              />
              <PeriodSection
                icon={<MoonIcon />}
                label="하교 마음 기록"
                sessions={afternoonSessions}
                studentName={student.name}
                active={activePeriod === "afternoon"}
                isLast
              />
            </div>
            <div className="mt-1">
              <AiAnalysisBox
                key={`analysis-${student.studentId}-${date}`}
                studentId={student.studentId}
                date={date}
                fallback={preview.analysis}
              />
            </div>
          </>
        )}
      </article>

      {isToday ? (
        <CommentComposer
          key={`comment-${student.studentId}-${date}`}
          studentId={student.studentId}
          studentName={student.name}
          date={date}
          fallbackDraft={preview.draft}
        />
      ) : (
        <p className="px-1 text-xs text-gray-500">
          선생님의 한마디는 오늘 날짜에서 작성해요. 저장한 한마디는 다음날 등교 때 아이에게 전달돼요.
        </p>
      )}
    </div>
  );
}

function PeriodSection({
  icon,
  label,
  sessions,
  studentName,
  active,
  isLast,
}: {
  icon: React.ReactNode;
  label: string;
  sessions: DaySession[];
  studentName: string;
  /** 두 시간대 중 가장 최근 기록이 있는 쪽 — ClassPlaybook류 타임라인처럼 강조 표시 */
  active: boolean;
  /** 마지막 항목이면 아래로 이어지는 연결선을 그리지 않는다 */
  isLast: boolean;
}) {
  // 같은 시간대에 재시도가 있으면 마지막 시도의 색을 대표로 보여준다
  const latest = [...sessions].sort((a, b) => b.attempt - a.attempt)[0];

  return (
    <section className="relative flex gap-3 pb-5">
      {!isLast && <span aria-hidden className="absolute top-9 bottom-0 left-[15px] w-px bg-gray-200" />}
      <div
        aria-hidden
        className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ${
          active ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"
        }`}
      >
        {icon}
      </div>
      <div className={`min-w-0 flex-1 rounded-xl ${active ? "bg-indigo-50/70 px-3.5 py-3" : "pt-0.5"}`}>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold">{label}</h3>
          {latest ? (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-600">
              <span className={timestampText}>{formatKstDateTime(latest.startedAt).slice(11, 16)}</span>
              <span className={`inline-block size-2 rounded-full ${SIGNAL_DOT[latest.color]}`} />
              {SIGNAL_LABEL[latest.color]}
            </span>
          ) : (
            <span className="ml-auto text-xs text-gray-400">기록 없음</span>
          )}
        </div>

        {sessions.length === 0 ? (
          <p className="mt-2 rounded-xl bg-[#f8f7f4] px-4 py-3 text-[13px] text-gray-400">이 시간대에는 체크인하지 않았어요.</p>
        ) : (
          <div className="mt-2 space-y-3">
            {sessions.map((session) => (
              <div key={session.sessionId}>
                {(sessions.length > 1 || session.status === "stopped") && (
                  <div className="mb-1.5 flex items-center gap-2 text-[11px] text-gray-500">
                    {sessions.length > 1 && <span>{session.attempt}회차</span>}
                    {session.status === "stopped" && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-600">중단됨</span>
                    )}
                  </div>
                )}
                <ConversationTurns turns={session.turns} studentName={studentName} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="size-4">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" className="size-4">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  );
}
