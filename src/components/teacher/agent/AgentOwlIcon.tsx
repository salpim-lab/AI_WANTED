// 담당: 이지현 (단독 소유)
// 협진 챗봇 아이콘. 로봇 이모지(🤖)가 "살핌"의 따뜻한 톤과 안 맞는다는 피드백으로 교체.
// 올빼미 = "지혜로운 조언자" 상징(듀오링고 등에서도 흔히 쓰는 은유) — 챗봇이되 차갑지 않게.
// 눈동자 색은 앱 전체에서 쓰는 인디고(#6366f1)를 그대로 써서 브랜드 색과 자연스럽게 이어지게 함.
//
// (2026-09-19) "올빼미만 보면 챗봇인지 바로 안 와닿는다"는 피드백 — 헤드셋을 씌워서 "상담
// 도우미"라는 신호를 더했다. 색은 새로 안 늘리고 눈동자와 같은 인디고를 그대로 써서 통일감 유지.
export default function AgentOwlIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      {/* 헤드셋 밴드 + 이어컵 + 마이크 — 몸통보다 먼저 그려서 귀깃/몸통에 자연스럽게 가려지게 함 */}
      <path d="M8 17 Q16 5 24 17" fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="7.6" cy="17.5" r="2.3" fill="#6366f1" />
      <circle cx="24.4" cy="17.5" r="2.3" fill="#6366f1" />
      <path d="M24.4 19 Q23.5 24 17.5 23.2" fill="none" stroke="#6366f1" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="17.3" cy="23.2" r="1.1" fill="#6366f1" />
      {/* 귀깃 */}
      <path d="M8 9 L12 6 L11 12 Z" fill="#D9A86C" />
      <path d="M24 9 L20 6 L21 12 Z" fill="#D9A86C" />
      {/* 몸통 */}
      <circle cx="16" cy="18" r="13" fill="#EFCB9C" />
      {/* 눈 */}
      <circle cx="11.2" cy="16.5" r="5.6" fill="#fff" />
      <circle cx="20.8" cy="16.5" r="5.6" fill="#fff" />
      <circle cx="11.9" cy="16.8" r="2.8" fill="#6366f1" />
      <circle cx="20.1" cy="16.8" r="2.8" fill="#6366f1" />
      <circle cx="12.7" cy="15.9" r="0.9" fill="#fff" />
      <circle cx="20.9" cy="15.9" r="0.9" fill="#fff" />
      {/* 부리 */}
      <path d="M14.3 22.5 L17.7 22.5 L16 25.6 Z" fill="#E8963C" />
    </svg>
  );
}
