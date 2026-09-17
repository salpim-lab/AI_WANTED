import "server-only";
import type { TranscriptMessage } from "@/lib/supabase/raw/wholeTranscript";
import { ITEM_INFERENCE_SCHEMA, parseItemInference } from "@/lib/items/itemInference";
import { callModel, ItemAIError } from "./client";
import { ITEM_INFERENCE_PROMPT } from "./prompts/item-inference";
export function buildItemInferenceRequest(messages: TranscriptMessage[]) {
  return {
    model: process.env.OPENAI_ITEM_MODEL || "gpt-4.1-mini",
    instructions: ITEM_INFERENCE_PROMPT,
    input: [{ role: "user", content: JSON.stringify({ transcript: messages }) }],
    text: { format: { type: "json_schema", name: "item_inference", strict: true, schema: ITEM_INFERENCE_SCHEMA } },
    max_output_tokens: 2000, store: false,
  };
}
export async function inferItem(messages: TranscriptMessage[]) {
  const utterances = messages.filter(m => m.speaker === "student").map(m => m.content);
  if (!utterances.length) throw new ItemAIError("INSUFFICIENT_TRANSCRIPT", 422, "학생 발화가 없습니다.");
  if (JSON.stringify(messages).length > 30000) throw new ItemAIError("TRANSCRIPT_TOO_LONG", 422, "현재 추론 입력 길이를 초과했습니다.");
  return callModel("AI", buildItemInferenceRequest(messages), 45000, {
    unavailable: "추론 응답을 받지 못했습니다. 다시 시도해 주세요.",
    failed: "추론 요청에 실패했습니다. 키와 모델 설정을 확인해 주세요.",
    invalid: "추론 결과를 검증하지 못했습니다. 다시 시도해 주세요.",
  }, value => parseItemInference(value, utterances));
}
