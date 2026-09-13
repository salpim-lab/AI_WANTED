// 담당: 진승혜
// 대시보드 섹션 3: 최근 갈등 발생 목록, 양측 진술 나란히 보기
// 참고: 살핌_기획안.md "6.4 갈등 기록 — 최대 기록 업무"

import { CONFLICT_ROWS } from "./mockData";

export default function ConflictLog() {
  return (
    <div className="card">
      <div className="card-title">
        갈등 기록 <span className="cnt">{CONFLICT_ROWS.length}</span>
      </div>
      {CONFLICT_ROWS.map((row, i) => (
        <div className="conflict-row" key={i}>
          <div className="conflict-header">
            <strong>{row.date}</strong>
            <span>·</span>
            <span>{row.pair}</span>
          </div>
          <div className="conflict-stmts">
            {row.statements.map((st, j) => (
              <div className="conflict-stmt" key={j}>
                <div className="who" style={{ color: st.color }}>
                  {st.who}
                </div>
                {st.text}
              </div>
            ))}
          </div>
          {row.warn && <div className="conflict-warn">{row.warn}</div>}
        </div>
      ))}
    </div>
  );
}
