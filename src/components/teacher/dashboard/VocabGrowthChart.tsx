// 담당: 진승혜
// 대시보드 영역 5: 감정 어휘 성장 — 그래프가 카드의 중심이다.
// 숫자/평균/변화량은 그래프를 보조만 한다 (제목 옆 한 줄, 카드 하단 한 줄).
// 축·격자선을 그리지 않고 막대 위 값과 아래 이름만으로 읽히게 한다.
// 막대에 올리면 그 아이가 실제로 쓴 표제어를 펼친다 — "14개"라는 숫자만으로는
// 교사가 무엇을 칭찬하고 무엇을 더 끌어낼지 알 수 없다. 이번 달 새로 쓴 말은 따로 표시한다.
// (오늘의 교실 명단 툴팁과 같은 방식: JS 없이 :hover / :focus-within 으로만)
// 차트 라이브러리를 새로 설치하지 않고 CSS/SVG 로만 그린다 (package.json 변경 금지).
// 데이터: page.tsx 가 "선택 날짜까지의 누적"으로 조립해 props 로 내려준다.
//   실제로는 app/api/ai/vocab-growth/route.ts
// 참고: 살핌_기획안.md "7.3 감정 어휘 성장 — 측정 가능한 교육 성과"

import type { DashboardData } from "./mockData";

export default function VocabGrowthChart({ students, trend }: DashboardData["vocab"]) {
  const maxCount = Math.max(...students.map((d) => d.count));
  const average =
    Math.round((students.reduce((sum, d) => sum + d.count, 0) / students.length) * 10) / 10;

  const thisMonth = trend[trend.length - 1];
  const lastMonth = trend[trend.length - 2];
  const monthDelta = Math.round((thisMonth.average - lastMonth.average) * 10) / 10;
  const deltaLabel = `${monthDelta > 0 ? "+" : ""}${monthDelta}`;

  return (
    <section className="card vocab-card">
      <div className="card-title">
        감정 어휘 성장
        <span className="card-sub">누적 어휘 개수 · 학생 {students.length}명</span>
        <span className="vocab-trend-note">
          {thisMonth.month} 평균 {thisMonth.average}개
          <em className={monthDelta < 0 ? "down" : undefined}>지난달 {deltaLabel}</em>
        </span>
      </div>

      <ul className="vocab-chart">
        {students.map((d) => {
          const aboveAverage = d.count >= average;
          // 이번 달에 새로 쓴 말은 목록의 뒤쪽에 온다 (먼저 쓴 순으로 정렬돼 있다)
          const newFrom = d.count - d.delta;
          return (
            <li className="vocab-bar-group" key={d.studentId}>
              <button type="button" className="vocab-trigger">
                <span className={"vocab-val" + (aboveAverage ? " above" : "")}>{d.count}</span>
                <span className="vocab-track">
                  <span
                    className={"vocab-bar" + (aboveAverage ? " above" : "")}
                    style={{ height: `${Math.round((d.count / maxCount) * 100)}%` }}
                  />
                </span>
                <span className="student-label">{d.name.slice(1)}</span>
              </button>

              <div className="vocab-tooltip" role="tooltip">
                <div className="vocab-tooltip-head">
                  {d.name}
                  <span className="vocab-tooltip-total">누적 {d.count}개</span>
                </div>
                <ul className="vocab-word-list">
                  {d.words.map((word, i) => (
                    <li key={word} className={i >= newFrom ? "fresh" : undefined}>
                      {word}
                    </li>
                  ))}
                </ul>
                <p className="vocab-tooltip-foot">
                  {d.delta > 0 ? (
                    <>
                      <i className="vocab-fresh-key" /> 이번 달 새로 쓴 말 {d.delta}개
                    </>
                  ) : (
                    "이번 달에 새로 쓴 말은 아직 없어요."
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="vocab-foot">
        <span>
          <i className="vocab-key above" /> 평균 이상
        </span>
        <span>
          <i className="vocab-key" /> 평균 이하
        </span>
        <span className="vocab-foot-right">
          학급 평균 <strong>{average}개</strong>
        </span>
      </div>
    </section>
  );
}
