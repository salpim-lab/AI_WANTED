// 담당: 진승혜
// 대시보드 영역 4: 오늘의 교실 — 아이가 아니라 "교실의 날씨"를 본다
// 상태 문구가 핵심, 숫자는 보조. 감정 분포는 사이가 벌어진 부드러운 가로 막대.
// 각 감정 위에 마우스를 올리거나 키보드로 포커스하면 그 색을 고른 아이 명단이 뜬다
// (JS 없이 :hover / :focus-within 으로만 — 무거운 modal 로 만들지 않는다).
// 참고: 살핌_기획안.md "7.2 오늘의 교실 — 아이가 아니라 환경을 진단"
// 데이터: page.tsx 가 선택 날짜의 감정 분포로 조립해 props 로 내려준다.

import Link from "next/link";
import WeatherIcon from "./WeatherIcon";
import { SIGNAL_DISPLAY, type DashboardData } from "./mockData";

export default function ClassroomToday({
  classroom,
  isToday,
}: {
  classroom: DashboardData["classroom"];
  isToday: boolean;
}) {
  const { weather, delta, mood, recentDays } = classroom;
  const total = mood.reduce((sum, m) => sum + m.count, 0);

  return (
    <section className="card classroom-card">
      <div className="card-title">
        {isToday ? "오늘의 교실" : "그날의 교실"}
      </div>
      <p className="classroom-question">{weather.question}</p>

      <div className="classroom-weather">
        <WeatherIcon kind={weather.kind} size={56} />
        <div>
          <div className="classroom-headline">{weather.headline}</div>
          <p className="classroom-support">{weather.support}</p>
        </div>
      </div>

      <div className="classroom-bar" role="img" aria-label={`감정 분포 · 총 ${total}명`}>
        {mood.map((m) => (
          <span
            key={m.color}
            className="classroom-bar-seg"
            style={{ flexGrow: m.count, background: SIGNAL_DISPLAY[m.color].cssVar }}
          />
        ))}
      </div>

      <ul className="classroom-legend">
        {mood.map((m) => {
          const label = SIGNAL_DISPLAY[m.color].label;
          return (
            <li className="mood-item" key={m.color}>
              <button type="button" className="mood-trigger" aria-expanded={false}>
                <span className="cl-head">
                  <span className={`dot dot-${m.color}`} />
                  {label}
                </span>
                <span className="cl-count">
                  {m.count}
                  <em>명</em>
                </span>
              </button>

              <div className="mood-tooltip" role="tooltip">
                <div className="mood-tooltip-head">
                  <span className={`dot dot-${m.color}`} />
                  {label}
                  <span className="mood-tooltip-total">{m.count}명</span>
                </div>
                {m.students.length > 0 ? (
                  <ul className="mood-name-list">
                    {m.students.map((s) => (
                      <li key={s.studentId}>
                        <Link href={`/students/${s.studentId}`} className="mood-name">
                          {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mood-empty">이 색을 고른 아이가 없어요.</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="classroom-delta">{delta}</p>

      <div className="classroom-recent">
        {recentDays.map((d) => (
          <div
            className={"classroom-recent-day" + (d.isToday ? " today" : "")}
            key={d.date}
            title={`${d.date} (${d.weekday})`}
          >
            <span className="crd-weekday">{d.weekday}</span>
            <WeatherIcon kind={d.kind} size={30} />
          </div>
        ))}
      </div>
    </section>
  );
}
