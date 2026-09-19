// 담당: 진승혜
// 대시보드 영역 4: 오늘의 교실 — 아이가 아니라 "교실의 날씨"를 본다
// 상태 문구가 핵심, 숫자는 보조. 감정 분포는 사이가 벌어진 부드러운 가로 막대.
// 각 감정 위에 마우스를 올리거나 키보드로 포커스하면 그 색을 고른 아이 명단이 뜬다
// (JS 없이 :hover / :focus-within 으로만 — 무거운 modal 로 만들지 않는다).
//
// 등교/하교 탭 — 아이 상세의 "등교 마음 기록 / 하교 마음 기록" 구분을 여기서도 쓴다.
// 다만 아이 상세는 둘을 같은 화면에 나란히 쌓아 보여주지만(한 아이라 다 들어간다),
// 여기는 스무 명의 분포를 보여줘야 해서 한 번에 하나씩 탭으로 자른다.
// 탭은 URL 에 넣지 않는다 — 관계 지도 기간 토글과 같은 이유로, 카드 하나 안에서 훑어보는
// 값이라 주소가 바뀌면 뒤로가기가 성가셔진다. 그래서 이 컴포넌트만 클라이언트다.
// 처음 열렸을 때 어느 탭이 보일지는 서버가 정한다(classroom.defaultPeriod) — 그날 더
// 최근에 기록이 쌓인 시간대다.
//
// 참여/미참여는 등교·하교를 가르지 않는 하루 전체 집계라 탭 밖에 있다 — 질문 문장
// 바로 밑, 탭보다 위에 둔다("우리 반 마음에는…" 다음에 바로 보이게).
// 참고: 살핌_기획안.md "7.2 오늘의 교실 — 아이가 아니라 환경을 진단"
// 데이터: page.tsx 가 선택 날짜의 감정 분포로 조립해 props 로 내려준다.

"use client";

import { useState } from "react";
import Link from "next/link";
import WeatherIcon from "./WeatherIcon";
import { SIGNAL_DISPLAY, type CheckinPeriod, type DashboardData } from "./mockData";

const PERIOD_TABS: { id: CheckinPeriod; label: string }[] = [
  { id: "morning", label: "등교" },
  { id: "afternoon", label: "하교" },
];

export default function ClassroomToday({
  classroom,
  participation,
  isToday,
}: {
  classroom: DashboardData["classroom"];
  participation: DashboardData["participation"];
  isToday: boolean;
}) {
  const [tab, setTab] = useState<CheckinPeriod>(classroom.defaultPeriod);
  const { weather, mood } = classroom.periods[tab];
  const { delta, recentDays } = classroom;
  const total = mood.reduce((sum, m) => sum + m.count, 0);
  const { completedCount, totalCount, absentStudents } = participation;

  return (
    <section className="card classroom-card">
      <div className="card-title">
        {isToday ? "오늘의 교실" : "그날의 교실"}
      </div>
      <p className="classroom-question">{weather.question}</p>

      {/* 참여 인원 — 단독 카드였던 걸 한 줄로 줄였다. 같은 날의 같은 체크인 집계라
          여기 두는 편이 맞고, 평소엔 숫자만 있으면 된다. 등교/하교를 가르지 않는 하루
          전체 값이라 탭보다 위, 질문 바로 밑에 둔다.
          미참여 아이 이름은 눌러야 할 일이 있을 때만 위에 올려서 본다. */}
      <div className="classroom-attend">
        <span className="ca-label">{isToday ? "오늘 참여" : "이 날 참여"}</span>
        <span className="ca-count">
          <strong>{completedCount}</strong> / {totalCount}명
        </span>
        {absentStudents.length > 0 ? (
          <div className="mood-item ca-absent">
            <button type="button" className="ca-absent-trigger">
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
          <span className="ca-all">모두 참여했어요</span>
        )}
      </div>

      {/* 등교/하교 탭 — 관계 지도의 기간 토글과 같은 모양(.rel-period)을 그대로 쓴다 */}
      <div className="rel-period classroom-period" role="group" aria-label="등교·하교">
        {PERIOD_TABS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={"rel-period-btn" + (p.id === tab ? " on" : "")}
            aria-pressed={p.id === tab}
            onClick={() => setTab(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

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
