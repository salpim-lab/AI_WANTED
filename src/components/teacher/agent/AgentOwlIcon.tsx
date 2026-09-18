// 담당: 이지현 (단독 소유)
// 협진 챗봇 아이콘. 로봇 이모지(🤖)가 "살핌"의 따뜻한 톤과 안 맞는다는 피드백으로 교체.
// 올빼미 = "지혜로운 조언자" 상징(듀오링고 등에서도 흔히 쓰는 은유) — 챗봇이되 차갑지 않게.
// 눈동자 색은 앱 전체에서 쓰는 인디고(#6366f1)를 그대로 써서 브랜드 색과 자연스럽게 이어지게 함.
export default function AgentOwlIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
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
