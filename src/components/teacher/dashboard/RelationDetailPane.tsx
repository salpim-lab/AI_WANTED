// 담당: 진승혜
// 관계 지도 옆 패널. 아이를 누르면 그 아이의 관계가 여기 펼쳐진다 — 아이 상세로 넘어가지 않는다.
//
// 왜 페이지를 넘기지 않나: 교사가 지도를 볼 때 하는 일은 "이 선이 뭐지?"를 확인하는 거다.
// 확인하려고 화면을 떠났다가 돌아오면 지도의 맥락(누가 크고 누가 떨어져 있었는지)이 끊긴다.
// 그래서 지도는 그대로 두고 옆에서만 바뀐다.
//
// 아무도 안 눌렀을 때는 최근 갈등 기록을 보여준다 — 빈 패널을 두느니 그게 낫다.
//
// 갈등 기록이 여러 건이면 아래로 쌓지 않고 카로셀로 한 건씩 넘긴다 (ConflictCarousel).
// 쌓으면 패널이 길어지고, 길어진 패널이 같은 행의 관계 지도까지 끌고 늘어난다.
// 기록 하나는 통째로 보여야 진술 둘이 "엇갈린 진술"로 읽히므로 잘라서 쌓지 않는다.
//
// 읽기 전용이다. work_records / conflict_statements 쓰기는 김현우 담당.

import { useState } from "react";
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

      {/* 진술이 엇갈린다는 안내 줄은 뺐다 — 두 진술을 나란히 놓은 것 자체가 이미 그 말이고,
          노란 경고 박스가 붙으면 아직 확인 중인 일이 판정된 일처럼 읽힌다. */}
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
    </article>
  );
}

/** 한 번에 한 건씩 옆으로 넘긴다. 1건이면 ‹ › 줄 없이 카드 하나로만 보인다.
    공용 HorizontalScroller 를 쓰지 않는 이유: 그쪽은 보이는 폭의 80%씩 굴리는 방식이라
    scroll-snap: x mandatory 와 부딪혀 넘긴 자리에서 도로 제자리로 스냅해 버린다.
    여기는 한 장이 곧 한 칸이므로 스크롤 대신 transform 으로 장을 옮긴다 — 스냅이 낄 자리가 없다.

    rows 가 바뀌어도(다른 아이를 고름) 이 컴포넌트는 같은 자리에 남으므로,
    호출부에서 key 로 새로 만들어 첫 장부터 보게 한다. */
function ConflictCarousel({ rows, label }: { rows: ConflictRow[]; label: string }) {
  const [page, setPage] = useState(0);
  const last = rows.length - 1;

  return (
    <div className="rd-conflicts">
      {/* 몇 번째인지는 숫자로 말하지 않는다 — 제목의 "N건"이 전체 수를 이미 말했고,
          두어 건을 넘겨 보는 데 1/2 라는 눈금까지는 필요 없다. */}
      {rows.length > 1 && (
        <div className="rd-carousel-nav">
          <button
            type="button"
            className="rd-carousel-btn"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            aria-label={`${label} 이전`}
          >
            ‹
          </button>
          <button
            type="button"
            className="rd-carousel-btn"
            onClick={() => setPage((p) => Math.min(last, p + 1))}
            disabled={page === last}
            aria-label={`${label} 다음`}
          >
            ›
          </button>
        </div>
      )}

      <div className="rd-carousel-viewport">
        <div className="rd-carousel-track" style={{ transform: `translateX(-${page * 100}%)` }}>
          {rows.map((row, i) => (
            <div
              className="rd-carousel-slide"
              key={`${row.date}-${row.pair}`}
              /* 보이지 않는 장은 탭 순서와 읽기에서 뺀다 — 화면 밖 카드로 포커스가 새면
                 칸이 옆으로 밀려 버린다 */
              aria-hidden={i !== page}
              inert={i !== page ? true : undefined}
            >
              <ConflictArticle row={row} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 제목 옆 건수 — "갈등 기록 2건". 0건일 때는 숫자를 달지 않는다 (아래 문장이 대신 말한다). */
function CountBadge({ n }: { n: number }) {
  return n > 0 ? <span className="cnt">{n}건</span> : null;
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
    고른 것이 있으면 제목 자리가 곧 이름이다 — "관계 상세"라는 칸 이름 대신 "김민준"이 서고,
    그 옆(안내 문구가 있던 자리·크기)에 "다른 아이 대화에 6번 나왔어요"가 붙는다.
    아무것도 안 고른 동안에만 "관계 상세 · 아이나 선을 누르면 여기에 나와요"로 돌아간다.
    본문에 따로 이름 줄을 두지 않는 이유: 제목 옆이 비고 본문만 한 단 내려가서,
    고른 아이가 바뀐 게 눈에 늦게 들어왔다.
    패널에는 스크롤을 걸지 않는다 — 칸 높이가 고정이라 안쪽이 알아서 맞춰진다 (CSS 참고).
    고른 것을 푸는 "닫기"는 여기가 아니라 지도 안 오른쪽 위에 있다 (RelationshipMap). */
function Pane({
  title = "관계 상세",
  note,
  children,
}: {
  /** 고른 것이 있으면 그 이름이 칸 제목 자리에 선다 */
  title?: string;
  /** 제목 옆 한 줄 — 안내 문구와 같은 자리·같은 크기다 */
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="conflict-pane">
      <div className="pane-title">
        {title}
        {note && <span className="pane-sub">{note}</span>}
      </div>
      <div className="rd-body">{children}</div>
    </div>
  );
}

export default function RelationDetailPane({
  detail,
  pair,
  periodLabel,
  fallbackConflicts,
}: {
  detail: RelationDetail | null;
  pair: RelationPairDetail | null;
  periodLabel: string;
  /** 아무것도 선택하지 않았을 때 보여줄 최근 갈등 */
  fallbackConflicts: ConflictRow[];
}) {
  // 선을 눌렀을 때 — "이 선이 왜 생겼나"에만 답한다.
  if (pair) {
    return (
      <Pane
        title={`${pair.a.name} ↔ ${pair.b.name}`}
        note={
          pair.mentionCount > 0
            ? `서로 ${pair.mentionCount}번 이야기에 나왔어요`
            : "서로 언급한 기록은 없어요"
        }
      >
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
          <CountBadge n={pair.conflicts.length} />
        </div>
        {pair.conflicts.length === 0 ? (
          <p className="conflict-empty">두 아이 사이의 갈등 기록은 없어요.</p>
        ) : (
          <ConflictCarousel
            key={`pair-${pair.a.name}-${pair.b.name}`}
            rows={pair.conflicts}
            label={`${pair.a.name}·${pair.b.name} 갈등 기록`}
          />
        )}
      </Pane>
    );
  }

  if (!detail) {
    return (
      <Pane note="아이나 선을 누르면 여기에 나와요">
        {fallbackConflicts.length === 0 ? (
          <p className="conflict-empty">이 날짜까지 기록된 갈등이 없어요.</p>
        ) : (
          <>
            {/* 건수는 고른 기간 안의 것이다 — 제목에 기간을 붙여야 "누적 4건"이 읽힌다 */}
            <div className="rd-section-title">
              {periodLabel} 갈등 기록
              <CountBadge n={fallbackConflicts.length} />
            </div>
            <ConflictCarousel key="recent" rows={fallbackConflicts} label="최근 갈등 기록" />
          </>
        )}
      </Pane>
    );
  }

  return (
    <Pane title={detail.name} note={`다른 아이 대화에 ${detail.mentionCount}번 나왔어요`}>
      {detail.quotes.length > 0 && (
        <>
          <div className="rd-section-title">대화에서</div>
          <QuoteList quotes={detail.quotes} />
        </>
      )}

      <div className="rd-section-title">
        갈등 기록
        <CountBadge n={detail.conflicts.length} />
      </div>
      {detail.conflicts.length === 0 ? (
        <p className="conflict-empty">{periodLabel} 갈등 기록이 없어요.</p>
      ) : (
        <ConflictCarousel
          key={`student-${detail.name}`}
          rows={detail.conflicts}
          label={`${detail.name} 갈등 기록`}
        />
      )}
    </Pane>
  );
}
