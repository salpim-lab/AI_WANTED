// 담당: 진승혜
// 관계 지도 옆 패널. 아이를 누르면 그 아이의 관계가 여기 펼쳐진다 — 아이 상세로 넘어가지 않는다.
//
// 왜 페이지를 넘기지 않나: 교사가 지도를 볼 때 하는 일은 "이 선이 뭐지?"를 확인하는 거다.
// 확인하려고 화면을 떠났다가 돌아오면 지도의 맥락(누가 크고 누가 떨어져 있었는지)이 끊긴다.
// 그래서 지도는 그대로 두고 옆에서만 바뀐다.
//
// 아무도 안 눌렀을 때는 최근 갈등 기록을 보여준다 — 빈 패널을 두느니 그게 낫다.
// 읽기 전용이다. work_records / conflict_statements 쓰기는 김현우 담당.

import type { ConflictRow, ConflictStatement, RelationDetail } from "./mockData";

// mockData 의 SIGNAL_DISPLAY 를 쓰면 클라이언트 번들에 mock 전체가 딸려온다. 네 줄이라 여기 둔다.
const STATEMENT_COLOR: Record<ConflictStatement["tone"], string> = {
  green: "var(--green)",
  yellow: "var(--yellow)",
  red: "var(--red)",
  navy: "var(--navy)",
  muted: "var(--muted)",
};

function ConflictArticle({ row }: { row: ConflictRow }) {
  return (
    <article className="conflict-row">
      <header className="conflict-header">
        <strong>{row.label}</strong>
        <span className="conflict-pair">{row.pair}</span>
      </header>

      <div className="conflict-summary">
        {row.summary}
        <span className="conflict-status">{row.status}</span>
      </div>

      <div className="conflict-stmts">
        {row.statements.map((st, i) => (
          <div className="conflict-stmt" key={i}>
            <div className="who" style={{ color: STATEMENT_COLOR[st.tone] }}>
              {st.who}
            </div>
            <p>{st.text}</p>
          </div>
        ))}
      </div>

      {row.warn && <p className="conflict-warn">{row.warn}</p>}
    </article>
  );
}

function PeerList({ title, peers }: { title: string; peers: RelationDetail["mentionedBy"] }) {
  return (
    <div className="rd-peers">
      <div className="rd-peers-title">{title}</div>
      {peers.length === 0 ? (
        <p className="rd-empty">없어요</p>
      ) : (
        <ul className="rd-peer-list">
          {peers.map((p) => (
            <li key={p.studentId}>
              {p.name}
              <em>{p.count}</em>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RelationDetailPane({
  detail,
  fallbackConflicts,
  onClear,
}: {
  detail: RelationDetail | null;
  /** 아무도 선택하지 않았을 때 보여줄 최근 갈등 */
  fallbackConflicts: ConflictRow[];
  onClear: () => void;
}) {
  if (!detail) {
    return (
      <div className="conflict-pane">
        <div className="pane-title">
          관계 상세
          <span className="pane-sub">아이를 누르면 그 아이 이야기가 나와요</span>
        </div>
        {fallbackConflicts.length === 0 ? (
          <p className="conflict-empty">이 날짜까지 기록된 갈등이 없어요.</p>
        ) : (
          <>
            <div className="rd-section-title">최근 갈등 기록</div>
            {fallbackConflicts.map((row) => (
              <ConflictArticle key={`${row.date}-${row.pair}`} row={row} />
            ))}
          </>
        )}
      </div>
    );
  }

  const total = detail.mentionedBy.reduce((sum, p) => sum + p.count, 0);

  return (
    <div className="conflict-pane">
      <div className="pane-title">
        관계 상세
        <button type="button" className="rd-clear" onClick={onClear}>
          닫기
        </button>
      </div>

      <div className="rd-head">
        <strong className="rd-name">{detail.name}</strong>
        <span className="rd-sub">최근 2주 · 이름이 나온 횟수 {total}번</span>
      </div>

      <div className="rd-peer-cols">
        <PeerList title="이 아이를 말한 친구" peers={detail.mentionedBy} />
        <PeerList title="이 아이가 말한 친구" peers={detail.mentioning} />
      </div>

      {detail.quotes.length > 0 && (
        <>
          <div className="rd-section-title">대화에서</div>
          <ul className="rd-quotes">
            {detail.quotes.map((q, i) => (
              <li key={i}>
                <p>&ldquo;{q.text}&rdquo;</p>
                <span className="rd-quote-by">
                  {q.from} · {q.date.slice(5).replace("-", "/")}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="rd-section-title">
        갈등 기록
        <span className="cnt">{detail.conflicts.length}</span>
      </div>
      {detail.conflicts.length === 0 ? (
        <p className="conflict-empty">최근 2주 갈등 기록이 없어요.</p>
      ) : (
        detail.conflicts.map((row) => <ConflictArticle key={`${row.date}-${row.pair}`} row={row} />)
      )}
    </div>
  );
}
