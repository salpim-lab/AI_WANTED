// 담당: 이유민
// 하단 기본 동작. 화면에서 상시 보이는 유일한 버튼이다.
//
// 상태는 useVoiceRecorder 가 준다. 이 컴포넌트는 그리기만 한다.
//   idle       말하기 시작
//   requesting 마이크 권한 팝업 대기
//   recording  파형 + 경과 초 + "다 말했어요"(누르면 종료)
//   processing 녹음 정리 중
//   denied     마이크를 못 쓴다 → 칩으로 고르게 한다
//
// 문구 원칙: 재촉하지 않는다.
// 조용해졌을 때 "다 말했어?" 라고 되묻지 않는 이유: 아이 입장에서는 "그만 말해"로 읽힌다.
// 대신 기다리고 있다는 것과 끝내는 방법만 알려준다.
//
// 경과 초를 숫자로 보이지 않는다. 초 단위 카운터는 아이에게 제한 시간처럼 읽혀
// "빨리 말해야 한다"는 압박이 된다. 녹음 중이라는 신호는 파형과 버튼 색으로 충분하다.
// 60초 상한이 다가올 때만 숫자 없이 마무리하자고 알려준다.
import type { RecorderStatus } from "./useVoiceRecorder";

/** 이 초부터 곧 끊긴다고 미리 알려준다 (MAX_RECORDING_MS = 60s). 숫자로는 보이지 않는다 */
const WARN_FROM_MS = 50_000;
/** 버튼 양옆 파형. 가운데가 높은 좌우 대칭이라 한 벌을 뒤집어 반대편에 쓴다 */
const BAR_SCALE = [0.4, 0.66, 1, 0.84];

function subLabel(elapsedMs: number, askIfDone: boolean) {
  if (elapsedMs >= WARN_FROM_MS) return "이제 슬슬 마무리하자";
  if (askIfDone) return "다 말했으면 눌러줘";
  return "천천히 말해도 괜찮아";
}

function Wave({ level, flip }: { level: number; flip?: boolean }) {
  const bars = flip ? [...BAR_SCALE].reverse() : BAR_SCALE;
  return (
    <span className="talk-wave" aria-hidden="true">
      {bars.map((s, i) => (
        // 무음일 때도 완전히 눕지 않게 바닥을 둔다 (죽은 화면처럼 보인다)
        <span key={i} style={{ transform: `scaleY(${0.18 + level * s * 1.5})` }} />
      ))}
    </span>
  );
}

export default function TalkButton({
  status,
  elapsedMs,
  level,
  askIfDone,
  onStart,
  onStop,
  onFallback,
  disabled,
}: {
  status: RecorderStatus;
  elapsedMs: number;
  level: number;
  askIfDone: boolean;
  onStart: () => void;
  onStop: () => void;
  /** 마이크를 못 쓸 때 칩으로 넘긴다 */
  onFallback: () => void;
  disabled?: boolean;
}) {
  if (status === "recording") {
    return (
      <button
        type="button"
        className="talk-btn talk-btn--recording"
        onClick={onStop}
        aria-label="말하기 끝내기"
      >
        <span className="talk-btn__row">
          <Wave level={level} />
          다 말했어요
          <Wave level={level} flip />
        </span>
        <span className="talk-btn__sub">{subLabel(elapsedMs, askIfDone)}</span>
      </button>
    );
  }

  if (status === "denied" || status === "error") {
    return (
      <button type="button" className="talk-btn talk-btn--muted" onClick={onFallback}>
        <span className="talk-btn__row">글로 골라서 말할래</span>
        <span className="talk-btn__sub">
          {status === "denied" ? "마이크를 못 쓰고 있어" : "소리가 잘 안 들어와"}
        </span>
      </button>
    );
  }

  const busy = status === "requesting" || status === "processing";
  return (
    <button
      type="button"
      className="talk-btn"
      onClick={onStart}
      disabled={disabled || busy}
      aria-live="polite"
    >
      <span className="talk-btn__row">
        {status === "requesting" ? "마이크 켜는 중…" : status === "processing" ? "듣는 중…" : "말하기 시작"}
      </span>
      <span className="talk-btn__sub">
        {busy ? "잠깐만 기다려줘" : "한 번만 눌러서 편하게 말해요!"}
      </span>
    </button>
  );
}
