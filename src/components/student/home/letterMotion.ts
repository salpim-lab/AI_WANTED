// 담당: 이유민
// 편지 닫기 동작의 조절값. CSS 변수로 내려보내고, 화면 전환 타이머도 같은 값을 읽는다.
// 한곳에만 두는 이유: 예전에는 CSS 의 시간과 MorningHome 의 타이머 숫자를 따로 맞춰야 해서
// 한쪽만 바꾸면 봉투가 움직이는 도중에 사라지곤 했다.
//
// 닫기 순서(0 = x 누른 순간):
//   0.00  편지지가 봉투로 들어간다 (0.45s, 고정)
//   0.45  덮개가 닫힌다 (0.25s, 고정)
//   dropDelay  봉투가 아래로 미끄러져 내려간다 (dropDuration 동안, dropDistance 만큼)
//   greetDelay 인사가 떠오르기 시작한다 — 봉투가 내려가는 도중에 겹쳐 시작해야 장면이 끊기지 않는다
import type { CSSProperties } from "react";

export type LetterMotion = {
  /** 봉투가 내려가기 시작하는 시각(초). 덮개가 닫히는 끝(0.7)과 살짝 겹치면 이어져 보인다 */
  dropDelay: number;
  /** 내려가는 데 걸리는 시간(초) */
  dropDuration: number;
  /** 내려가는 거리(cqh). 화면 밖까지 보내지 않고 조금 내려가며 사라지게 둔다(70 이상이면 화면 밖) */
  dropDistance: number;
  /** 내려가며 기우는 각도(도). 0 이면 똑바로 */
  tilt: number;
  /** 인사가 떠오르기 시작하는 시각(초) */
  greetDelay: number;
};

export const DEFAULT_LETTER_MOTION: LetterMotion = {
  dropDelay: 0.5,
  dropDuration: 0.9,
  dropDistance: 34,
  tilt: 1,
  greetDelay: 1,
};

/** 편지 장면을 치워도 되는 시각(ms) — 봉투가 다 내려간 뒤 */
export const letterExitMs = (m: LetterMotion) => Math.round((m.dropDelay + m.dropDuration) * 1000);

/** CSS 변수로 내려보낸다. student-home.css 의 --lt-* 가 받는다. */
export const letterMotionVars = (m: LetterMotion) =>
  ({
    "--lt-drop-delay": `${m.dropDelay}s`,
    "--lt-drop-dur": `${m.dropDuration}s`,
    "--lt-drop-dist": `${m.dropDistance}cqh`,
    "--lt-tilt": `${m.tilt}deg`,
    "--lt-greet-delay": `${m.greetDelay}s`,
  }) as CSSProperties;
