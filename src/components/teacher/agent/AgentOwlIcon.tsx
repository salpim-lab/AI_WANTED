// 담당: 이지현 (단독 소유)
// 협진 챗봇 아이콘. 로봇 이모지(🤖)가 "살핌"의 따뜻한 톤과 안 맞는다는 피드백으로 교체.
// 올빼미 = "지혜로운 조언자" 상징(듀오링고 등에서도 흔히 쓰는 은유) — 챗봇이되 차갑지 않게.
//
// (2026-09-19) "헤드셋을 씌워서 상담 도우미 느낌을 내자" → SVG 도형을 직접 그려 헤드셋을
// 추가해봤는데, 손으로 그린 도형 조합이라 "헤드셋 같지도 않다"는 피드백. 이 세션엔 이미지 생성
// 도구가 없어 CC0 공개 이미지를 우리 색으로 재색해보기도 했지만, 결국 팀원(이지현)이 실제
// 일러스트(public/teacher_agent_logo.png)를 구해와서 그걸 쓰기로 함 — 정사각형 원본을
// object-cover로 원 안에 꽉 채운다("동그라미 꽉차게" 요청).
export default function AgentOwlIcon({ className }: { className?: string }) {
  return (
    <img
      src="/brand/salpim-chatbot-avatar.png"
      alt=""
      className={`rounded-full object-cover ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}
