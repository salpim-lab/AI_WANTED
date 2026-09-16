// 담당: 진승혜
// 대시보드 영역 3: 패턴 경고 — "빠르게 스캔하는 카드".
// 한 줄에 [학생 이름 · 핵심 패턴 · 짧은 상태 라벨] 세 가지만 보여준다.
// 근거 날짜(row.detail)는 화면에 펼치지 않고 title 툴팁으로만 숨겨둔다 — 데이터는 그대로 유지.
// 카드 전체가 경고처럼 보이지 않게: 아이콘 없이 작은 점 하나, chip 대신 텍스트 라벨.
// 표현 원칙: "위험 학생" 처럼 단정하지 않는다. "확인 필요" / "최근 반복된 변화" 처럼 중립적으로.
// 데이터는 규칙 기반이다 (LLM 미사용) → app/api/ai/pattern-alert/route.ts
//   선택 날짜를 기준으로 그 시점까지의 최근 N일 패턴을 받는다.
// 참고: 살핌_기획안.md "7.1 패턴 경고", 10(가드레일)

import { PATTERN_FOOTNOTE, PATTERN_TONE_LABEL, type PatternRow } from "./mockData";

export default function PatternAlert({ rows }: { rows: PatternRow[] }) {
  return (
    <section className="card">
      <div className="card-title">
        패턴 경고
        <span className="card-sub">반복해서 나타난 신호 · 최근 2주</span>
      </div>

      <ul className="pattern-list">
        {rows.map((row) => (
          <li
            className={`pattern-row tone-${row.tone}`}
            key={`${row.student}-${row.pattern}`}
            title={row.detail}
          >
            <span className="pattern-dot" aria-hidden />
            <strong className="pattern-student">{row.student}</strong>
            <span className="pattern-name">{row.pattern}</span>
            <span className="pattern-tag">{PATTERN_TONE_LABEL[row.tone]}</span>
          </li>
        ))}
      </ul>

      <p className="pattern-footnote">{PATTERN_FOOTNOTE}</p>
    </section>
  );
}
