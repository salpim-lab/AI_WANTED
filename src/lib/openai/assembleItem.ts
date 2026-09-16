import "server-only";
import type { ItemInference } from "../items/itemInference";
import { ITEM_ASSEMBLY_SCHEMA, parseItemAssembly } from "../items/itemAssembly";
import { ITEM_ASSEMBLY_PROMPT } from "./prompts/item-assembly";
import { ItemAIError } from "./inferItem";

export function buildItemAssemblyRequest(inference: ItemInference) {
  // Only appearance data is needed; do not resend private counseling or evidence.
  const input = { itemName: inference.itemName, subject: inference.subject, appearance: inference.appearance };
  return {
    model: process.env.OPENAI_ITEM_ASSEMBLY_MODEL || process.env.OPENAI_ITEM_MODEL || "gpt-4.1-mini",
    instructions: `${ITEM_ASSEMBLY_PROMPT}\n[API 출력 보충]\n모든 부품에 mirror와 repeat를 반드시 넣는다. 사용하지 않으면 null이다. 각뿔 sides도 반드시 넣는다. 도형별 지정 필드만 사용한다.`,
    input: [{ role: "user", content: JSON.stringify(input) }],
    text: { format: { type: "json_schema", name: "item_assembly", strict: true, schema: ITEM_ASSEMBLY_SCHEMA } },
    max_output_tokens: 12000, store: false,
  };
}

/** Server function only. A later generation job should call this after inferItem. */
export async function assembleItem(inference: ItemInference) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new ItemAIError("AI_NOT_CONFIGURED", 503, "OPENAI_API_KEY 설정이 필요합니다.");
  const request = buildItemAssemblyRequest(inference);
  if (JSON.stringify(request.input).length > 4000) throw new ItemAIError("INVALID_ASSEMBLY_INPUT", 422, "조립 입력이 너무 깁니다.");
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(request), signal: AbortSignal.timeout(60000), cache: "no-store",
    });
  } catch { throw new ItemAIError("ASSEMBLY_UNAVAILABLE", 504, "조립 응답을 받지 못했습니다."); }
  if (!response.ok) throw new ItemAIError("ASSEMBLY_REQUEST_FAILED", response.status === 429 ? 429 : 502, "조립 요청에 실패했습니다. 키와 모델 설정을 확인해 주세요.");
  try {
    const data = await response.json() as { status: string; output?: { type: string; content?: { type: string; text?: string }[] }[] };
    if (data.status !== "completed") throw new Error("incomplete");
    const content = (data.output ?? []).filter(o => o.type === "message").flatMap(o => o.content ?? []);
    if (content.some(c => c.type === "refusal")) throw new Error("refusal");
    const output = content.filter(c => c.type === "output_text").map(c => c.text ?? "").join("");
    return parseItemAssembly(JSON.parse(output), inference.itemName);
  } catch { throw new ItemAIError("INVALID_ASSEMBLY_OUTPUT", 502, "조립 결과를 검증하지 못했습니다."); }
}
