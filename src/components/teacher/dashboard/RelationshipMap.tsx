// 담당: 진승혜
// 대시보드 섹션 2: 발화에서 추출한 아이들 간 언급 관계망
// 참고: docs/prototype/prototype-teacher.html 관계 지도 (nodes/edges SVG) — 좌표는 mock, 그대로 이식
// 살핌_기획안.md "6.7 관계 지도"

export default function RelationshipMap() {
  return (
    <div className="card">
      <div className="card-title">
        관계 지도{" "}
        <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          발화에서 추출 · 최근 4주
        </span>
      </div>
      <div className="relation-map-wrap">
        <svg width="100%" height="240" viewBox="0 0 700 240" xmlns="http://www.w3.org/2000/svg">
          <line x1="200" y1="120" x2="350" y2="80" stroke="#fca5a5" strokeWidth={3} strokeLinecap="round" />
          <line x1="350" y1="80" x2="480" y2="130" stroke="#fca5a5" strokeWidth={2} strokeLinecap="round" />
          <line x1="200" y1="120" x2="310" y2="180" stroke="#d1d5db" strokeWidth={1.5} strokeLinecap="round" />
          <line x1="480" y1="130" x2="580" y2="90" stroke="#d1d5db" strokeWidth={1.5} strokeLinecap="round" />
          <line x1="480" y1="130" x2="560" y2="180" stroke="#d1d5db" strokeWidth={2} strokeLinecap="round" />
          <line x1="350" y1="80" x2="140" y2="60" stroke="#d1d5db" strokeWidth={1.5} strokeLinecap="round" />
          <line x1="310" y1="180" x2="420" y2="210" stroke="#d1d5db" strokeWidth={1.5} strokeLinecap="round" />
          <circle cx="90" cy="190" r="24" fill="#fef2f2" stroke="#fca5a5" strokeWidth={2} strokeDasharray="4 3" />
          <circle cx="200" cy="120" r="22" fill="#fee2e2" />
          <text x="200" y="124" textAnchor="middle" fontSize="12" fontWeight="700" fill="#b91c1c">민준</text>
          <circle cx="350" cy="80" r="20" fill="#fef2f2" />
          <text x="350" y="84" textAnchor="middle" fontSize="12" fontWeight="700" fill="#b91c1c">서연</text>
          <circle cx="480" cy="130" r="18" fill="#f3f4f6" />
          <text x="480" y="134" textAnchor="middle" fontSize="11" fontWeight="600" fill="#374151">하준</text>
          <circle cx="310" cy="180" r="18" fill="#f3f4f6" />
          <text x="310" y="184" textAnchor="middle" fontSize="11" fontWeight="600" fill="#374151">예린</text>
          <circle cx="580" cy="90" r="16" fill="#f3f4f6" />
          <text x="580" y="94" textAnchor="middle" fontSize="11" fontWeight="600" fill="#374151">지우</text>
          <circle cx="560" cy="180" r="16" fill="#f3f4f6" />
          <text x="560" y="184" textAnchor="middle" fontSize="11" fontWeight="600" fill="#374151">시아</text>
          <circle cx="140" cy="60" r="16" fill="#f3f4f6" />
          <text x="140" y="64" textAnchor="middle" fontSize="11" fontWeight="600" fill="#374151">준혁</text>
          <circle cx="420" cy="210" r="16" fill="#f3f4f6" />
          <text x="420" y="214" textAnchor="middle" fontSize="11" fontWeight="600" fill="#374151">수빈</text>
          <circle cx="90" cy="190" r="22" fill="#fff0f0" />
          <text x="90" y="188" textAnchor="middle" fontSize="11" fontWeight="600" fill="#b91c1c">지안</text>
          <text x="90" y="202" textAnchor="middle" fontSize="9" fill="#b91c1c">언급 0회</text>
          <rect x="10" y="10" width="12" height="3" rx="1" fill="#fca5a5" />
          <text x="26" y="18" fontSize="10" fill="#6b7280">갈등 관계</text>
          <circle cx="106" cy="15" r="5" fill="none" stroke="#fca5a5" strokeWidth={1.5} strokeDasharray="3 2" />
          <text x="116" y="18" fontSize="10" fill="#6b7280">3주간 언급 없음</text>
        </svg>
      </div>
    </div>
  );
}
