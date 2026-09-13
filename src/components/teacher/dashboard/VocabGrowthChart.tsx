// 담당: 진승혜
// 대시보드 섹션 6: 월별 아이별 감정 어휘 종류 증가 추이 그래프
// 데이터는 /api/ai/vocab-growth 에서 가져올 것 — 지금은 mock
// 참고: 살핌_기획안.md "7.3 감정 어휘 성장 — 측정 가능한 교육 성과"

import { VOCAB_DATA } from "./mockData";

export default function VocabGrowthChart() {
  const max = Math.max(...VOCAB_DATA.map((d) => d.count));
  const chartH = 100;
  const avg = Math.round((VOCAB_DATA.reduce((s, d) => s + d.count, 0) / VOCAB_DATA.length) * 10) / 10;

  return (
    <div className="card">
      <div className="card-title">
        감정 어휘 성장
        <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          누적 어휘 개수 · 학생 20명
        </span>
      </div>
      <div className="vocab-chart">
        {VOCAB_DATA.map((d) => {
          const h = Math.round((d.count / max) * chartH);
          const isAbove = d.count >= avg;
          const bg = isAbove ? "linear-gradient(180deg,#818cf8,#6366f1)" : "linear-gradient(180deg,#c7d2fe,#a5b4fc)";
          const valColor = isAbove ? "#4338ca" : "#818cf8";
          return (
            <div className="vocab-bar-group" key={d.name} title={`${d.name}: ${d.count}개`}>
              <div className="vocab-bar" style={{ height: h, background: bg }}>
                <span className="val" style={{ color: valColor }}>
                  {d.count}
                </span>
              </div>
              <div className="student-label">{d.name.slice(1)}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#6366f1" }} /> 평균
          이상
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#a5b4fc" }} /> 평균
          이하
        </span>
        <span style={{ marginLeft: "auto" }}>
          학급 평균 <strong style={{ color: "var(--accent)" }}>{avg}</strong>개
        </span>
      </div>
    </div>
  );
}
