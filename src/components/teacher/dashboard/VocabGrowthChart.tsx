// 담당: 진승혜
// 대시보드 영역 5: 감정 어휘 성장 — 그래프가 카드의 중심이다.
// 숫자/평균/변화량은 그래프를 보조만 한다 (제목 옆 한 줄, 카드 하단 한 줄).
// 축·격자선을 그리지 않고 막대 위 값과 아래 이름만으로 읽히게 한다.
// 막대에 올리면 그 아이가 실제로 쓴 표제어를 펼친다 — "14개"라는 숫자만으로는
// 교사가 무엇을 칭찬하고 무엇을 더 끌어낼지 알 수 없다. 이번 달 새로 쓴 말은 따로 표시한다.
// (오늘의 교실 명단 툴팁과 같은 방식: JS 없이 :hover / :focus-within 으로만)
// 툴팁은 막대 위로 편다 — 숫자 바로 위, 스무 개가 모두 같은 높이에서 나온다.
// 막대 높이를 따라 오르내리면 옆 아이와 견주려고 마우스를 옮길 때마다 눈이 툴팁을 다시 찾아야 한다.
// 아래에 두면 마지막 막대의 툴팁이 카드 밖으로 나가 화면 전체에 가로 스크롤이 생기고,
// 옆에 붙이면 툴팁이 바로 이웃 막대를 덮어 비교하던 것을 가린다.
// 좌우로 잘리지 않게 양 끝 몇 칸만 안쪽으로 붙인다 — 몇 번째 막대인지는 CSS 가 알 수 없어 여기서 정한다.
// 차트 라이브러리를 새로 설치하지 않고 CSS/SVG 로만 그린다 (package.json 변경 금지).
// 데이터: page.tsx 가 "선택 날짜까지의 누적"으로 조립해 props 로 내려준다.
//   실제로는 app/api/ai/vocab-growth/route.ts
// 참고: 살핌_기획안.md "7.3 감정 어휘 성장 — 측정 가능한 교육 성과"

import type { DashboardData } from "./mockData";

export default function VocabGrowthChart({ students, trend }: DashboardData["vocab"]) {
  const maxCount = Math.max(1, ...students.map((d) => d.count));
  // 막대 색(평균 이상/이하)을 가르는 기준으로만 쓴다 — 카드 하단에 숫자로 따로 적지는 않는다.
  // 제목 옆 "9월 평균 N개"가 이미 같은 이야기를 하고, 범례가 어느 쪽이 위인지 말해 준다.
  const average = students.length
    ? Math.round((students.reduce((sum, d) => sum + d.count, 0) / students.length) * 10) / 10
    : 0;

  const thisMonth = trend.at(-1) ?? { month: "이번 달", average: 0 };
  const lastMonth = trend.at(-2) ?? thisMonth;
  const monthDelta = Math.round((thisMonth.average - lastMonth.average) * 10) / 10;
  const deltaLabel = `${monthDelta > 0 ? "+" : ""}${monthDelta}`;

  /* 가운데 정렬이 기본이고, 양 끝 세 칸만 카드 안쪽으로 붙인다.
     툴팁 폭이 230px 이라 막대 세 칸 남짓을 덮는다 — 그만큼만 끝에서 당기면 잘리지 않는다. */
  const EDGE_BARS = 3;
  const tipAlign = (index: number) =>
    index < EDGE_BARS ? "tip-start" : index >= students.length - EDGE_BARS ? "tip-end" : "tip-center";

  return (
    <section className="card vocab-card">
      <div className="card-title">
        감정 어휘 성장
        <span className="card-sub">누적 어휘 개수 | 학생 {students.length}명</span>
        <span className="vocab-trend-note">
          {thisMonth.month} 평균 {thisMonth.average}개
          <em className={monthDelta < 0 ? "down" : undefined}>지난달 {deltaLabel}</em>
        </span>
      </div>

      <ul className="vocab-chart">
        {students.map((d, index) => {
          const aboveAverage = d.count >= average;
          // 이번 달에 새로 쓴 말은 목록의 뒤쪽에 온다 (먼저 쓴 순으로 정렬돼 있다)
          const newFrom = d.count - d.delta;
          return (
            <li
              className={"vocab-bar-group " + tipAlign(index)}
              key={d.studentId}
            >
              <button type="button" className="vocab-trigger">
                <span className={"vocab-val" + (aboveAverage ? " above" : "")}>{d.count}</span>
                <span className="vocab-track">
                  <span
                    className={"vocab-bar" + (aboveAverage ? " above" : "")}
                    style={{ height: `${Math.round((d.count / maxCount) * 100)}%` }}
                  />
                </span>
                <span className="student-label">{d.shortName ?? d.name.slice(-2)}</span>
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
      </div>
    </section>
  );
}
