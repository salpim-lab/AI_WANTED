import "server-only";
import type { TranscriptMessage } from "@/lib/supabase/raw/wholeTranscript";
import { ITEM_INFERENCE_SCHEMA, parseItemInference } from "@/lib/items/itemInference";
import { ITEM_INFERENCE_PROMPT } from "./prompts/item-inference";
export class ItemAIError extends Error {
  constructor(public code: string, public httpStatus: number, message: string) { super(message); }
}
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
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new ItemAIError("AI_NOT_CONFIGURED", 503, "OPENAI_API_KEY 설정이 필요합니다.");
  const utterances = messages.filter(m => m.speaker === "student").map(m => m.content);
  if (!utterances.length) throw new ItemAIError("INSUFFICIENT_TRANSCRIPT", 422, "학생 발화가 없습니다.");
  if (JSON.stringify(messages).length > 30000) throw new ItemAIError("TRANSCRIPT_TOO_LONG", 422, "현재 추론 입력 길이를 초과했습니다.");
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildItemInferenceRequest(messages)), signal: AbortSignal.timeout(45000), cache: "no-store",
    });
  } catch { throw new ItemAIError("AI_UNAVAILABLE", 504, "추론 응답을 받지 못했습니다. 다시 시도해 주세요."); }
  if (!response.ok) throw new ItemAIError("AI_REQUEST_FAILED", response.status === 429 ? 429 : 502, "추론 요청에 실패했습니다. 키와 모델 설정을 확인해 주세요.");
  try {
    const data = await response.json() as { status: string; output?: { type: string; content?: { type: string; text?: string }[] }[] };
    if (data.status !== "completed") throw new Error("incomplete");
    const content = (data.output ?? []).filter(o => o.type === "message").flatMap(o => o.content ?? []);
    if (content.some(c => c.type === "refusal")) throw new Error("refusal");
    const output = content.filter(c => c.type === "output_text").map(c => c.text ?? "").join("");
    return parseItemInference(JSON.parse(output), utterances);
  } catch { throw new ItemAIError("INVALID_AI_OUTPUT", 502, "추론 결과를 검증하지 못했습니다. 다시 시도해 주세요."); }
}
