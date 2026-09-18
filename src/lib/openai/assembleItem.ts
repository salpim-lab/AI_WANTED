import "server-only";
import type { ItemInference } from "../items/itemInference";
import { ITEM_ASSEMBLY_SCHEMA, parseItemAssembly } from "../items/itemAssembly";
import { ITEM_ASSEMBLY_PROMPT } from "./prompts/item-assembly";
import { callModel, ItemAIError } from "./client";

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
  const request = buildItemAssemblyRequest(inference);
  if (JSON.stringify(request.input).length > 4000) throw new ItemAIError("INVALID_ASSEMBLY_INPUT", 422, "조립 입력이 너무 깁니다.");
  return callModel("ASSEMBLY", request, 120000, {
    unavailable: "조립 응답을 받지 못했습니다.",
    failed: "조립 요청에 실패했습니다. 키와 모델 설정을 확인해 주세요.",
    invalid: "조립 결과를 검증하지 못했습니다.",
  }, value => parseItemAssembly(value, inference.itemName));
}
