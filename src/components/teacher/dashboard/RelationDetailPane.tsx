// 담당: 진승혜
// 관계 지도 옆 패널. 아이를 누르면 그 아이의 관계가 여기 펼쳐진다 — 아이 상세로 넘어가지 않는다.
//
// 왜 페이지를 넘기지 않나: 교사가 지도를 볼 때 하는 일은 "이 선이 뭐지?"를 확인하는 거다.
// 확인하려고 화면을 떠났다가 돌아오면 지도의 맥락(누가 크고 누가 떨어져 있었는지)이 끊긴다.
// 그래서 지도는 그대로 두고 옆에서만 바뀐다.
//
// 아무도 안 눌렀을 때는 최근 갈등 기록을 보여준다 — 빈 패널을 두느니 그게 낫다.
// 읽기 전용이다. work_records / conflict_statements 쓰기는 김현우 담당.

import type {
  ConflictRow,
  ConflictStatement,
  RelationDetail,
  RelationPairDetail,
} from "./mockData";

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

/** 기록이 여러 건이면 아래로 쌓지 않고 한 칸 안에서 넘긴다 — 쌓으면 패널이 길어지고,
    길어진 패널이 같은 행의 관계 지도까지 끌고 늘어난다. */
function ConflictList({ rows }: { rows: ConflictRow[] }) {
  return (
    <div className="rd-conflicts">
      {rows.map((row) => (
        <ConflictArticle key={`${row.date}-${row.pair}`} row={row} />
      ))}
    </div>
  );
}

function QuoteList({ quotes }: { quotes: RelationDetail["quotes"] }) {
  return (
    <ul className="rd-quotes">
      {quotes.map((q, i) => (
        <li key={i}>
          <p>&ldquo;{q.text}&rdquo;</p>
          <span className="rd-quote-by">
            {q.from} · {q.date.slice(5).replace("-", "/")}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 세 갈래(선택 없음 / 아이 / 선)가 같은 제목 줄을 쓴다.
    패널에는 스크롤을 걸지 않는다 — 길어지는 덩어리는 각자 안에서 잘린다 (CSS 참고). */
function Pane({
  action,
  children,
}: {
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="conflict-pane">
      <div className="pane-title">
        관계 상세
        {action}
      </div>
      <div className="rd-body">{children}</div>
    </div>
  );
}

export default function RelationDetailPane({
  detail,
  pair,
  fallbackConflicts,
  onClear,
}: {
  detail: RelationDetail | null;
  pair: RelationPairDetail | null;
  /** 아무것도 선택하지 않았을 때 보여줄 최근 갈등 */
  fallbackConflicts: ConflictRow[];
  onClear: () => void;
}) {
  const closeButton = (
    <button type="button" className="rd-clear" onClick={onClear}>
      닫기
    </button>
  );

  // 선을 눌렀을 때 — "이 선이 왜 생겼나"에만 답한다.
  if (pair) {
    return (
      <Pane action={closeButton}>
        <div className="rd-head">
          <strong className="rd-name">
            {pair.a.name} ↔ {pair.b.name}
          </strong>
          <span className="rd-sub">
            {pair.mentionCount > 0
              ? `최근 2주 · 서로 ${pair.mentionCount}번 이야기에 나왔어요`
              : "최근 2주 · 서로 언급한 기록은 없어요"}
          </span>
        </div>

        <div className="rd-section-title">이 선이 생긴 이유</div>
        {pair.quotes.length > 0 ? (
          <QuoteList quotes={pair.quotes} />
        ) : (
          <p className="conflict-empty">
            대화에서 서로를 말한 기록은 없고, 아래 갈등 기록 때문에 이어져 있어요.
          </p>
        )}

        <div className="rd-section-title">
          갈등 기록
          <span className="cnt">{pair.conflicts.length}</span>
        </div>
        {pair.conflicts.length === 0 ? (
          <p className="conflict-empty">두 아이 사이의 갈등 기록은 없어요.</p>
        ) : (
          <ConflictList rows={pair.conflicts} />
        )}
      </Pane>
    );
  }

  if (!detail) {
    return (
      <Pane action={<span className="pane-sub">아이나 선을 누르면 여기에 나와요</span>}>
        {fallbackConflicts.length === 0 ? (
          <p className="conflict-empty">이 날짜까지 기록된 갈등이 없어요.</p>
        ) : (
          <>
            <div className="rd-section-title">최근 갈등 기록</div>
            <ConflictList rows={fallbackConflicts} />
          </>
        )}
      </Pane>
    );
  }

  return (
    <Pane action={closeButton}>
      <div className="rd-head">
        <strong className="rd-name">{detail.name}</strong>
        <span className="rd-sub">최근 2주 · 다른 아이 대화에 {detail.mentionCount}번 나왔어요</span>
      </div>

      {detail.quotes.length > 0 && (
        <>
          <div className="rd-section-title">대화에서</div>
          <QuoteList quotes={detail.quotes} />
        </>
      )}

      <div className="rd-section-title">
        갈등 기록
        <span className="cnt">{detail.conflicts.length}</span>
      </div>
      {detail.conflicts.length === 0 ? (
        <p className="conflict-empty">최근 2주 갈등 기록이 없어요.</p>
      ) : (
        <ConflictList rows={detail.conflicts} />
      )}
    </Pane>
  );
}
