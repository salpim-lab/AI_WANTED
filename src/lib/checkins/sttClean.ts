// 담당: 이유민
// 음성 인식(Whisper) 결과에서 "말소리가 아닌데 만들어 낸 글"을 걷어 낸다.
//
// 왜 필요한가: Whisper 는 무음·잡음·먼 소리 구간에서도 글을 만들어 낸다. 실측(2026-09-20, 같은 힌트 프롬프트):
//   무음 4초 → "수고하셨습니다." / "고맙습니다."     (no_speech_prob 0.92·0.94)
//   잡음 4초 → "시청해주셔서 감사합니다."             (no_speech_prob 0.43~0.88, avg_logprob -0.90)
//   실제 말소리 → no_speech_prob 0.00~0.08, avg_logprob -0.25~-0.38
// 아이가 대답을 못 하고 가만히 있어도, 또 말 앞에 조용한 구간이 있어도 이런 문장이 아이 발화로 저장돼 AI 에 들어갔다
// ("Q. 요즘에 가장 즐거운 시간은?" 같은 아이가 하지 않은 문장이 답 앞에 붙는 것도 같은 현상이다).
//
// 조각(segment)마다 오는 값으로 말소리가 아닌 조각을 버린다:
//   ① no_speech_prob(말소리가 아닐 확률)이 0.5 이상
//   ② no_speech_prob 가 0.3 이상이면서 avg_logprob(모델 자신감)이 -0.7 이하 — 잡음은 ① 에 안 걸리고(0.43) 자신감만 낮다
//   ③ compression_ratio 가 2.4 이상 — 같은 말이 반복되는 환각
// 어디에도 안 걸리면 그대로 둔다.
// ⚠️ 이건 "지워서 고치는" 것이 아니라 "말소리가 아닌 조각을 빼는" 것이다. 남은 글은 고치지 않는다.

export type SttSegment = {
  text?: string;
  no_speech_prob?: number;
  avg_logprob?: number;
  compression_ratio?: number;
};

/** 이 확률 이상이면 말소리가 아니다 (말소리 ≤ 0.1, 무음 ≥ 0.9 으로 실측) */
export const NO_SPEECH_MAX = 0.5;
/** 이 확률 이상이고 자신감이 낮으면 말소리가 아니다 (잡음: 0.43, -0.90) */
export const NO_SPEECH_DOUBT = 0.3;
export const LOGPROB_DOUBT = -0.7;
/** 이 압축률 이상이면 같은 말이 반복되는 환각이다 */
export const COMPRESSION_MAX = 2.4;

export function cleanTranscript(data: { text?: unknown; segments?: unknown }): { text: string; dropped: string[] } {
  const segments = Array.isArray(data.segments) ? (data.segments as SttSegment[]) : null;
  // 조각 정보가 없으면(다른 응답 형식) 있는 그대로 쓴다 — 없는 정보로 지우지 않는다
  if (!segments) return { text: typeof data.text === "string" ? data.text.trim() : "", dropped: [] };

  const kept: string[] = [];
  const dropped: string[] = [];
  for (const segment of segments) {
    const text = (segment.text ?? "").trim();
    if (!text) continue;
    const noSpeech = typeof segment.no_speech_prob === "number" ? segment.no_speech_prob : 0;
    const logprob = typeof segment.avg_logprob === "number" ? segment.avg_logprob : 0;
    const silent = noSpeech >= NO_SPEECH_MAX || (noSpeech >= NO_SPEECH_DOUBT && logprob <= LOGPROB_DOUBT);
    const repeated = typeof segment.compression_ratio === "number" && segment.compression_ratio >= COMPRESSION_MAX;
    (silent || repeated ? dropped : kept).push(text);
  }
  return { text: kept.join(" ").trim(), dropped };
}
