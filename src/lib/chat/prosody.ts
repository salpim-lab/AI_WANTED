// 담당: 이유민
// 발화 파생 수치. 기획안 §8.1 이 "저장"하라고 한 값이다.
//
//   전사 텍스트 → 저장 / 파생 수치 → 저장 / 원본 음성 → 즉시 파기
//
// 이 수치는 감정 판정이 아니라 측정값이다. 개인을 식별할 수 없고,
// 교사 화면에 "검증 가능한 근거"로 표시된다 — "첫 응답 전 3.1초 침묵, 성량 30% 감소".
//
// 비교는 반드시 **본인 기준선 대비**로 한다. 집단 비교는 하지 않는다.
// 국내 연구에서 한국어 발화 속도는 연령에 따라 유의하게 증가하는 것이 확인되어,
// 학년이 다르면 기준 자체가 다르다. 또래 비교는 성립하지 않는다.

/** 발화 한 번의 측정값. 절대값만 담고, 기준선 대비는 서버에서 계산한다. */
export type UtteranceProsody = {
  index: number;
  /** 발화 길이(초) */
  duration_sec: number;
  /** 질문이 끝나고 말을 시작하기까지(초) */
  response_delay_sec: number;
  /** 발화 중 무음 구간 횟수 */
  silence_count: number;
  /** 무음 구간 합계(초) */
  silence_total_sec: number;
  /** 음절/초. 전사가 나온 뒤 계산한다 */
  syllables_per_sec?: number;
  /** 이번 발화의 평균 음량(0~1 상대값). 기준선 대비는 서버에서 */
  loudness_raw: number;
};

export type SessionProsody = {
  utterances: UtteranceProsody[];
  /** 이 비교에 쓰인 기준선 일수. 부족하면 해석하지 않는다 */
  baseline_days: number;
};

/** 무음으로 볼 음량 임계값 (0~1) */
export const SILENCE_THRESHOLD = 0.02;
/** 이만큼 이어져야 무음 구간 1회로 센다. 아이는 말하다 1~2초씩 멈칫한다 */
export const SILENCE_MIN_MS = 700;
/** 녹음 상한. 마이크를 켜둔 채 방치되는 것을 막는다 */
export const MAX_RECORDING_MS = 60_000;
/** 말하기를 눌렀는데 이만큼 조용하면 가이드를 다시 띄운다. 무슨 말을 할지 몰라 멈춰 있는 것이다 */
export const QUIET_HINT_MS = 3_500;
/** 이만큼 조용하면 "다 말했어?" 하고 묻는다. 끄지는 않는다 */
export const ASK_IF_DONE_MS = 8_000;

/** 음량 샘플 배열에서 무음 구간을 센다. 샘플 간격은 sampleMs. */
export function countSilences(levels: number[], sampleMs: number) {
  const minSamples = Math.max(1, Math.round(SILENCE_MIN_MS / sampleMs));
  let count = 0;
  let totalMs = 0;
  let run = 0;
  for (const level of levels) {
    if (level < SILENCE_THRESHOLD) {
      run += 1;
      continue;
    }
    if (run >= minSamples) {
      count += 1;
      totalMs += run * sampleMs;
    }
    run = 0;
  }
  if (run >= minSamples) {
    count += 1;
    totalMs += run * sampleMs;
  }
  return { silence_count: count, silence_total_sec: +(totalMs / 1000).toFixed(2) };
}

/** 소리가 난 구간만 평균한다. 무음까지 넣으면 말을 오래 쉰 아이가 작게 말한 것으로 잡힌다. */
export function meanLoudness(levels: number[]) {
  const voiced = levels.filter((l) => l >= SILENCE_THRESHOLD);
  if (!voiced.length) return 0;
  return +(voiced.reduce((a, b) => a + b, 0) / voiced.length).toFixed(4);
}

/** 한국어는 글자 수가 곧 음절 수에 가깝다. 공백·문장부호는 뺀다. */
export function countSyllables(text: string) {
  return (text.match(/[가-힣]/g) ?? []).length;
}

export function syllablesPerSec(text: string, durationSec: number) {
  if (durationSec <= 0) return 0;
  return +(countSyllables(text) / durationSec).toFixed(2);
}
