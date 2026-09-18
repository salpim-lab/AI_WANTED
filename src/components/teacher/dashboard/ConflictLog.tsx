// 담당: 진승혜
// 대시보드 영역 2-②: 최근 갈등 기록 — 관계 지도의 보조 패널.
// 위계: 날짜(진하게) → 학생(회색) → 요약(굵게) → 양측 진술 → 주의 문구
// 참고: 살핌_기획안.md "6.4 갈등 기록 — 최대 기록 업무"
// 읽기 전용이다. work_records / conflict_statements 쓰기는 김현우 담당 — 여기서는 절대 쓰지 않는다.
// 데이터: page.tsx 가 "선택 날짜 이하의 최근 기록"으로 걸러 props 로 내려준다.

import { SIGNAL_DISPLAY, type ConflictRow, type ConflictStatement } from "./mockData";

function statementColor(tone: ConflictStatement["tone"]) {
  return tone === "muted" ? "var(--muted)" : SIGNAL_DISPLAY[tone].cssVar;
}

export default function ConflictLog({ rows }: { rows: ConflictRow[] }) {
  return (
    <div className="conflict-pane">
      <div className="pane-title">
        갈등 기록
        <span className="cnt">{rows.length}</span>
      </div>

      {rows.length === 0 && <p className="conflict-empty">이 날짜까지 기록된 갈등이 없어요.</p>}

      {rows.map((row) => (
        <article className="conflict-row" key={`${row.date}-${row.pair}`}>
          <header className="conflict-header">
            <strong>{row.label}</strong>
            <span className="conflict-pair">{row.pair}</span>
          </header>

          <div className="conflict-summary">
            {row.summary}
            <span className="conflict-status">{row.status}</span>
          </div>

          <div className="conflict-stmts">
            {row.statements.map((st, j) => (
              <div className="conflict-stmt" key={j}>
                <div className="who" style={{ color: statementColor(st.tone) }}>
                  {st.who}
                </div>
                <p>{st.text}</p>
              </div>
            ))}
          </div>

          {row.warn && <p className="conflict-warn">{row.warn}</p>}
        </article>
      ))}
    </div>
  );
}
