// 담당: 이유민
// 하단 기본 동작. 화면에서 상시 보이는 유일한 버튼이다.
//
// 음성 녹음은 아직 연결되지 않았다 (VoiceRecorder / /api/ai/transcribe 미구현).
// 지금은 누르면 "무슨 말을 할지" 칩을 펼쳐 목업 흐름을 이어가게 한다.
// 실제 녹음이 붙으면 이 버튼이 녹음을 시작하고 칩은 주제 힌트로 바뀐다.
export default function TalkButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="talk-btn" onClick={onClick} disabled={disabled}>
      <span className="talk-btn__row">
        말하기 시작
      </span>
      <span className="talk-btn__sub">한 번만 눌러서 편하게 말해요!</span>
    </button>
  );
}
