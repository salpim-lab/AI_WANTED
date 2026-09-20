// 담당: 김현우
// 아이 상세 본문 — Server Component. 자리 배치도 오른쪽 열(StudentsSplitView)에 열린다.
//   카드 1: 아이 헤더(이름·날짜 선택·닫기) + 최근 날짜 칸 + 등교/하교 마음 기록(대화 전문) + AI 분석
//     같은 시간대에 여러 번 체크인했으면 대화가 남은 회차 중 가장 최근 것 하나만 보여준다 (이전 회차는 DB에 그대로 남는다).
//     색만 고르고 대화를 끝내지 않은 회차(대화 0턴)는 대화가 있는 회차가 하나도 없을 때만 보여준다.
//     AI 분석은 대화가 있는 마음 기록이 있을 때만 — 없으면 분석하지 않는다.
//   카드 2: 선생님의 한마디 — 오늘은 작성칸, 지난 날짜는 그날 보낸 한마디(있으면)를 읽기 전용으로
//   precomputed(배포 전 목업에 미리 넣어 둔 AI 분석·보낸 한마디)가 있으면 AI를 부르지 않고 그대로 보여준다.
// 참고: docs/planning/PLANNING.md "탭 2. 아이 상세 페이지"
// AI 분석·코멘트 초안은 API route를 클라이언트 컴포넌트에서 fetch로만 호출한다 (서버 전용 코드라 직접 import 불가):
//   - 분석: POST /api/ai/daily-analysis (analysis_runs, 원래 이지현 배정 — 김현우 구현, PR 협의)   → AiAnalysisBox
//   - 초안: POST /api/ai/comment-draft (feedback_drafts, 원래 이유민 배정 — 김현우 구현, PR 협의) → CommentComposer
// lib/supabase/interpretation/{teacherComment,dailyAnalysis}.ts는 직접 import하지 말 것.
// (참고: docs/planning/살핌_DB_스키마_v0.3.md §13 담당자별 작업 경계)

import Link from "next/link";
import { addDays, formatKstDate, formatKstDateTime } from "@/components/shared/datetime";
import { givenName } from "@/components/shared/names";
import { SIGNAL_DOT, SIGNAL_LABEL } from "@/components/shared/signalStyles";
import { salpimCard, salpimMuted, salpimPaperCard, salpimTitle, timestampText } from "@/components/shared/ui";
import type { FixtureDayAi } from "@/lib/supabase/raw/_mockTeacherData";
import type { ClassStudent, ColorHistoryDay, DaySession } from "@/lib/types/teacherRecord";
import AiAnalysisBox from "./AiAnalysisBox";
import CommentComposer from "./CommentComposer";
import ConversationTurns from "./ConversationTurns";
import MiniCalendar from "./MiniCalendar";
import StudentAvatar from "./StudentAvatar";
import DateControl from "@/components/teacher/shared/DateControl";

/** 그 시간대에 보여줄 회차 — 대화가 남은 가장 최근 회차, 없으면 가장 최근 회차 */
function shownSession(sessions: DaySession[]): DaySession | undefined {
  const byLatest = [...sessions].sort((a, b) => b.attempt - a.attempt);
  return byLatest.find((s) => s.turns.length > 0) ?? byLatest[0];
}

export default function StudentDetailPanel({
  student,
  date,
  today,
  sessions,
  history,
  preview,
  precomputed = null,
  stored = null,
}: {
  student: ClassStudent;
  date: string;
  today: string;
  sessions: DaySession[];
  history: ColorHistoryDay[];
  preview: { analysis: string | null; draft: string | null };
  /** 목업에 미리 넣어 둔 그날 AI 분석·보낸 한마디 — 있으면 AI를 부르지 않는다 */
  precomputed?: FixtureDayAi | null;
  /** DB에 이미 저장된 그날 AI 요약 — 필요한 요약이 전부 있으면 분석 API를 부르지 않고 이것을 보여준다(새로고침해도 같은 요약) */
  stored?: { morning: string | null; full: string | null; expects?: { morning: boolean; full: boolean } } | null;
}) {
  const isToday = date === today;
  const shortName = givenName(student.name);

  const morningSessions = sessions.filter((s) => s.period === "morning");
  const afternoonSessions = sessions.filter((s) => s.period === "afternoon");
  const morningShown = shownSession(morningSessions);
  const afternoonShown = shownSession(afternoonSessions);
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
      <article className={`${salpimCard} px-6 py-5`}>
        <header className="flex flex-wrap items-center gap-3.5">
          <StudentAvatar name={student.name} initial={shortName.slice(0, 1)} />
          <div className="min-w-0 flex-1">
            <h2 className={`${salpimTitle} text-[26px] leading-tight`}>{shortName}의 하루</h2>
          </div>
          <DateControl
            dateKey={date}
            today={today}
            basePath={`/students/${student.studentId}`}
            maxDate={today}
            label="기록 날짜 선택"
          />
          <Link
            href="/students"
            scroll={false}
            aria-label="상세 닫기"
            className="rounded-full px-2.5 py-1 text-lg text-[#7d849b] transition-colors hover:bg-[#ede9ff] hover:text-[#102a56]"
          >
            ✕
          </Link>
        </header>

        <div className="mt-4">
          <MiniCalendar studentId={student.studentId} history={history} selectedDate={date} today={today} />
        </div>

        {sessions.length === 0 ? (
          <div className={`mt-4 border-t border-[#e6e2fb] py-10 text-center ${salpimMuted}`}>
            <div>이 날은 쌓인 기록이 없어요.</div>
          </div>
        ) : (
          <>
            <div className="mt-4 border-t border-[#e6e2fb] pt-4">
              <PeriodSection
                icon={<SunIcon />}
                label="등교 마음 기록"
                session={morningShown}
                studentName={student.name}
                active={activePeriod === "morning"}
                isLast={false}
              />
              <PeriodSection
                icon={<MoonIcon />}
                label="하교 마음 기록"
                session={afternoonShown}
                studentName={student.name}
                active={activePeriod === "afternoon"}
                isLast
              />
            </div>
            <div className="mt-5">
              <AiAnalysisBox
                key={`analysis-${student.studentId}-${date}`}
                studentId={student.studentId}
                date={date}
                fallback={preview.analysis}
                hasMorning={Boolean(morningShown?.turns.length)}
                hasAfternoon={Boolean(afternoonShown?.turns.length)}
                precomputed={precomputed}
                stored={stored}
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
      ) : precomputed?.letter ? (
        <SentLetterCard date={date} final={precomputed.letter.final} />
      ) : (
        <p className={`px-1 text-xs ${salpimMuted}`}>
          선생님의 한마디는 오늘 날짜에서 작성해요. 저장한 한마디는 다음날 등교 때 아이에게 전달돼요.
        </p>
      )}
    </div>
  );
}

/** 지난 날짜에 보낸 한마디 — 수정할 수 없고 읽기만 한다. 아이는 다음 등교일(주말 포함, 곧 다음 날) 아침에 읽었다 */
function SentLetterCard({ date, final }: { date: string; final: string }) {
  const delivered = addDays(date, 1);
  return (
    <section className={`${salpimPaperCard} px-6 py-5`}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className={`${salpimTitle} text-xl`}>선생님의 한마디</h3>
        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
          ✓ {formatKstDate(delivered)} 등교 때 전달됨
        </span>
      </div>
      <p className="rounded-2xl border-[1.5px] border-[#ece0c9] px-4 py-3 font-[family-name:var(--font-hand)] text-[18px] leading-[1.7] whitespace-pre-wrap text-[#33405f]">
        {final}
      </p>
    </section>
  );
}

function PeriodSection({
  icon,
  label,
  session: latest,
  studentName,
  active,
  isLast,
}: {
  icon: React.ReactNode;
  label: string;
  /** shownSession이 고른 회차 — 없으면 그 시간대에 체크인하지 않은 것 */
  session: DaySession | undefined;
  studentName: string;
  /** 두 시간대 중 가장 최근 기록이 있는 쪽 — ClassPlaybook류 타임라인처럼 강조 표시 */
  active: boolean;
  /** 마지막 항목이면 구분선 아래 간격을 두지 않는다 (AI 분석 칸이 바로 이어진다) */
  isLast: boolean;
}) {
  return (
    <section className={`border-b border-[#e6e2fb] pb-5 ${isLast ? "" : "mb-5"}`}>
      {/* 아이콘과 대화 속 AI 아바타가 같은 왼쪽 선에 서도록, 대화는 들여쓰지 않고 머리글 아래로 내린다 */}
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
            active ? "bg-[#635bff] text-white shadow-[0_4px_12px_rgba(99,91,255,.35)]" : "bg-[#ede9ff] text-[#8b83ff]"
          }`}
        >
          {icon}
        </div>
        <h3 className={`${salpimTitle} text-[17px]`}>{label}</h3>
        {latest ? (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-[#7d849b]">
            <span className={timestampText}>{formatKstDateTime(latest.startedAt).slice(11, 16)}</span>
            <span className={`inline-block size-2 rounded-full ${SIGNAL_DOT[latest.color]}`} />
            {SIGNAL_LABEL[latest.color]}
          </span>
        ) : (
          <span className="ml-auto text-xs text-[#aab0c4]">기록 없음</span>
        )}
      </div>

      {!latest ? (
        <p className="mt-3 rounded-2xl border border-dashed border-[#ded8ff] bg-white/60 px-4 py-3 text-[13px] text-[#aab0c4]">이 시간대에는 체크인하지 않았어요.</p>
      ) : (
        <div className="mt-3">
          {latest.status === "stopped" && (
            <div className={`mb-1.5 text-[11px] ${salpimMuted}`}>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-600">중단됨</span>
            </div>
          )}
          <ConversationTurns key={latest.sessionId} turns={latest.turns} studentName={studentName} />
        </div>
      )}
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
