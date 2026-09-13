// 담당: 진승혜
// 대시보드 섹션 4: 요일·시간표 교차 이상징후 (예: 체육 있는 날 갈등 3회)
// 데이터는 /api/ai/pattern-alert (규칙 기반, LLM 미사용) 에서 가져올 것 — 지금은 mock
// 참고: 살핌_기획안.md "7.1 패턴 경고"

import { PATTERN_ROWS } from "./mockData";

export default function PatternAlert() {
  return (
    <div className="card">
      <div className="card-title">패턴 경고</div>
      {PATTERN_ROWS.map((row, i) => (
        <div className="pattern-row" key={i}>
          <div className="pattern-icon">{row.icon}</div>
          <div className="pattern-body">
            <div className="pname">{row.name}</div>
            <div className="pdesc" style={{ whiteSpace: "pre-line" }}>
              {row.desc}
            </div>
          </div>
          <span className={`chip ${row.chip.className}`} style={{ marginLeft: "auto", flexShrink: 0 }}>
            {row.chip.label}
          </span>
        </div>
      ))}
    </div>
  );
}
