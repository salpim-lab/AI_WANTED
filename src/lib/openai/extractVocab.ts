import "server-only";
import type { TranscriptMessage } from "@/lib/supabase/raw/wholeTranscript";
import { canonicalize, LEMMAS } from "@/lib/vocab/lexicon";
import { callModel, ItemAIError } from "./client";
import { VOCAB_EXTRACT_PROMPT, buildVocabExtractSchema } from "./prompts/vocab-extract";

export type VocabHit = { lemma: string; quote: string };

function parse(value: unknown, utterances: string[]): VocabHit[] {
  const found = (value as { found?: unknown })?.found;
  if (!Array.isArray(found)) throw new Error("found 배열이 없습니다.");
  const hits = new Map<string, VocabHit>();
  for (const raw of found) {
    const item = raw as { lemma?: unknown; quote?: unknown };
    const lemma = canonicalize(item.lemma);
    // 인용이 실제 학생 발화에 없으면 지어낸 근거다 — 그 건은 버린다.
    if (!lemma || typeof item.quote !== "string") continue;
    const quote = item.quote.trim();
    if (!quote || !utterances.some((u) => u.includes(quote))) continue;
    if (!hits.has(lemma)) hits.set(lemma, { lemma, quote });
  }
  return [...hits.values()];
}

/** 한 세션의 학생 발화에서 감정 표제어를 뽑는다. 개수·평균은 여기서 계산하지 않는다. */
export async function extractVocab(messages: TranscriptMessage[]): Promise<VocabHit[]> {
  const utterances = messages.filter((m) => m.speaker === "student").map((m) => m.content);
  if (!utterances.length) return [];
  if (JSON.stringify(messages).length > 30000)
    throw new ItemAIError("TRANSCRIPT_TOO_LONG", 422, "현재 추출 입력 길이를 초과했습니다.");

  const request = {
    model: process.env.OPENAI_VOCAB_MODEL || process.env.OPENAI_ITEM_MODEL || "gpt-4.1-mini",
    instructions: VOCAB_EXTRACT_PROMPT,
    input: [{ role: "user", content: JSON.stringify({ lexicon: LEMMAS, transcript: messages }) }],
    text: {
      format: {
        type: "json_schema",
        name: "vocab_extract",
        strict: true,
        schema: buildVocabExtractSchema(LEMMAS),
      },
    },
    max_output_tokens: 1500,
    store: false,
  };

  return callModel("AI", request, 30000, {
    unavailable: "감정 어휘 추출 응답을 받지 못했습니다. 다시 시도해 주세요.",
    failed: "감정 어휘 추출 요청에 실패했습니다. 키와 모델 설정을 확인해 주세요.",
    invalid: "감정 어휘 추출 결과를 검증하지 못했습니다. 다시 시도해 주세요.",
  }, (value) => parse(value, utterances));
}
