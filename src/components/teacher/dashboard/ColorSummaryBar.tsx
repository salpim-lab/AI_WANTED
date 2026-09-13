// 담당: 진승혜
// 대시보드 상단: 오늘의 색 현황 (등교 색 집계 + 하교 색 집계)
// 참고: docs/prototype/prototype-teacher.html 색 현황 섹션

import { COLOR_STATS } from "./mockData";

const COLOR_HEX: Record<string, string> = {
  green: "var(--green)",
  yellow: "var(--yellow)",
  red: "var(--red)",
  navy: "var(--navy)",
};
const COLOR_LABEL: Record<string, string> = { green: "초록", yellow: "노랑", red: "빨강", navy: "남색" };

function StatCard({ label, stats }: { label: string; stats: readonly { color: string; count: number; pct: number }[] }) {
  return (
    <div className="color-stat-card">
      <div className="label">{label}</div>
      <div className="color-stat-bar">
        {stats.map((s) => (
          <div key={s.color} style={{ width: `${s.pct}%`, background: COLOR_HEX[s.color] }}>
            {s.count}
          </div>
        ))}
      </div>
      <div className="color-legend">
        {stats.map((s) => (
          <span key={s.color}>
            <span className={`dot dot-${s.color}`} /> {COLOR_LABEL[s.color]} {s.count}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ColorSummaryBar() {
  return (
    <div className="color-stat-row">
      <StatCard label="등교 색 현황 · 20명" stats={COLOR_STATS.morning} />
      <StatCard label="하교 색 현황 · 20명" stats={COLOR_STATS.afternoon} />
    </div>
  );
}
