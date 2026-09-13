// 담당: 진승혜
// 대시보드 섹션 5: 학급 전체 등교→하교 색 변화 (집단 분위기 파악)
// 참고: 살핌_기획안.md "7.2 오늘의 교실 — 아이가 아니라 환경을 진단"

import { CLASSROOM_DELTA, COLOR_STATS } from "./mockData";

const COLOR_HEX: Record<string, string> = {
  green: "var(--green)",
  yellow: "var(--yellow)",
  red: "var(--red)",
  navy: "var(--navy)",
};

function Row({ label, stats }: { label: string; stats: readonly { color: string; count: number; pct: number }[] }) {
  return (
    <div className="classroom-row">
      <div className="time-label">{label}</div>
      <div className="bar-wrap">
        {stats.map((s) => (
          <div key={s.color} style={{ width: `${s.pct}%`, background: COLOR_HEX[s.color] }}>
            {s.count}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ClassroomToday() {
  return (
    <div className="card">
      <div className="card-title">
        오늘의 교실{" "}
        <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          학급 전체 등교→하교 변화
        </span>
      </div>
      <Row label="등교" stats={COLOR_STATS.morning} />
      <Row label="하교" stats={COLOR_STATS.afternoon} />
      <div className="classroom-delta">{CLASSROOM_DELTA}</div>
    </div>
  );
}
