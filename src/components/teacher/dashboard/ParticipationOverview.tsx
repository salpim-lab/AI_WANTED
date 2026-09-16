// 담당: 진승혜
// 대시보드 영역 6: 전체 참여도 — 숫자 카드가 아니라 "흐름"으로 읽히게 한다.
//   오늘 참여 → 오늘의 막대 → 이번 주 평균 → 최근 5일 추이 를 한 줄기로 배치.
// 미참여한 아이가 있으면 "미참여 N명" 위에 hover/포커스 해서 누구인지 볼 수 있다
//   — 오늘의 교실 mood tooltip 과 같은 CSS(:hover / :focus-within)를 그대로 재사용하므로
//     이 컴포넌트는 서버 컴포넌트로 남는다.
// 아이별 순위/평가 UI 는 만들지 않는다 (살핌_기획안.md 10. 가드레일).
// 데이터: page.tsx 가 선택 날짜의 완료 체크인 기준으로 조립해 props 로 내려준다.
//   실제로는 lib/supabase/queries/participation.ts (checkin_sessions.status='completed' 집계)

import Link from "next/link";
import type { ParticipationSummary } from "./mockData";

export default function ParticipationOverview({
  summary,
  isToday,
}: {
  summary: ParticipationSummary;
  isToday: boolean;
}) {
  const { completedCount, totalCount, weeklyAverageRate, absentStudents, recentDays } = summary;
  const todayRate = Math.round((completedCount / totalCount) * 100);

  return (
    <section className="card participation-card">
      <div className="card-title">
        전체 참여도
        <span className="card-sub">등·하교 체크인 완료 기준</span>
      </div>

      <div className="participation-today">
        <span className="pt-label">{isToday ? "오늘 참여" : "이 날 참여"}</span>
        <span className="pt-num">
          {completedCount}
          <em>명</em>
        </span>
        <span className="pt-total">/ {totalCount}명</span>
      </div>

      <div className="participation-track" role="img" aria-label={`참여율 ${todayRate}퍼센트`}>
        <div className="participation-fill" style={{ width: `${todayRate}%` }} />
      </div>

      {absentStudents.length > 0 ? (
        <div className="absent-item">
          <button type="button" className="absent-trigger">
            미참여 {absentStudents.length}명
          </button>

          <div className="mood-tooltip" role="tooltip">
            <div className="mood-tooltip-head">
              미참여 학생
              <span className="mood-tooltip-total">{absentStudents.length}명</span>
            </div>
            <ul className="mood-name-list">
              {absentStudents.map((s) => (
                <li key={s.studentId}>
                  <Link href={`/students/${s.studentId}`} className="mood-name">
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="absent-none">모두 참여했어요</p>
      )}

      <div className="participation-week">
        <span>최근 5일 평균</span>
        <strong>{weeklyAverageRate}%</strong>
      </div>

      <div className="participation-recent">
        {recentDays.map((d) => (
          <div
            className={"participation-day" + (d.isToday ? " today" : "")}
            key={d.date}
            title={`${d.date} (${d.weekday}) ${d.rate}%`}
          >
            <div className="pd-track">
              <div className="pd-fill" style={{ height: `${d.rate}%` }} />
            </div>
            <span className="pd-weekday">{d.weekday}</span>
          </div>
        ))}
      </div>

      <p className="participation-note">아이별 순위는 보지 않습니다. 학급 전체의 참여 흐름만 확인합니다.</p>
    </section>
  );
}
