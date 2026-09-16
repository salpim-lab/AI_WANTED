// 담당: 진승혜
// 대시보드 영역 5: 감정 어휘 성장 — 그래프가 카드의 중심이다.
// 숫자/평균/변화량은 그래프를 보조만 한다 (제목 옆 한 줄, 카드 하단 한 줄).
// 축·격자선을 그리지 않고 막대 위 값과 아래 이름만으로 읽히게 한다.
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

      <div className="vocab-chart">
        {students.map((d) => {
          const aboveAverage = d.count >= average;
          return (
            <div
              className="vocab-bar-group"
              key={d.studentId}
              title={`${d.name} · 누적 ${d.count}개 (이번 달 +${d.delta})`}
            >
              <span className={"vocab-val" + (aboveAverage ? " above" : "")}>{d.count}</span>
              <div className="vocab-track">
                <div
                  className={"vocab-bar" + (aboveAverage ? " above" : "")}
                  style={{ height: `${Math.round((d.count / maxCount) * 100)}%` }}
                />
              </div>
              <span className="student-label">{d.name.slice(1)}</span>
            </div>
          );
        })}
      </div>

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
